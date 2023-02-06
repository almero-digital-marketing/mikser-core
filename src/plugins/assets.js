import path from 'node:path'
import { mkdir, writeFile, unlink, rm, readFile, symlink, } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import minimatch from 'minimatch'

export default ({ 
    mikser, 
    onLoaded, 
    useLogger, 
    onImport, 
    watch, 
    onProcessed, 
    onBeforeRender, 
    useJournal, 
    createEntity, 
    updateEntity, 
    deleteEntity, 
    renderEntity, 
    onAfterRender, 
    onSync, 
    onFinalize, 
    findEntity,
    constants: { ACTION, OPERATION }, 
}) => {
    const collection = 'presets'
    const type = 'preset'
    const checksumMap = new Set()
    
    async function getEntityPresets(entity) {
        const entityPresets = []
        for(let preset in (mikser.config.assets?.presets || {})) {
            for (let match of mikser.config.assets.presets[preset]) {
                if (minimatch(entity.id, match)) {
                    entityPresets.push(preset)
                }
            }
        }
        return entityPresets
    }
    
    async function getRevisions(entity) {
        let revisions = await globby(`${entity.destination}.*.md5`, { 
            cwd: path.join(mikser.options.assetsFolder, entity.preset.name), 
            expandDirectories: false, 
            onlyFiles: true 
        })
        return revisions
    }
    
    async function isPresetRendered(entity) {
        let result = false
        let revisions = []
        const currentRevision = path.join(entity.preset.name, `${entity.name}.${entity.preset.checksum}.md5`)
        if (checksumMap.has(currentRevision)) {
            revisions.push(path.join(mikser.options.assetsFolder, currentRevision))
        } else {
            revisions = await getRevisions(entity)
        }
        
        for (let revision of revisions) {
            const [assetsRevision] = revision.split('.').slice(-2,-1)
            if (entity.preset.checksum <= Number.parseInt(assetsRevision)) {
                if (entity.preset.options?.checksum === false) {
                    result = true
                    break
                }
    
                let checksum = await readFile(revision, 'utf8')
                result ||= checksum == entity.checksum
                if (result) break
            }
        }
        return result
    }
    
    onLoaded(async () => {
        const logger = useLogger()
        
        mikser.state.assets = {
            presets: {},
            assetsMap: {}
        }
    
        mikser.options.presets = mikser.config.presets?.presetsFolder || collection
        mikser.options.presetsFolder = path.join(mikser.options.workingFolder, mikser.options.presets)
        logger.info('Presets folder: %s', mikser.options.presetsFolder)
        await mkdir(mikser.options.presetsFolder, { recursive: true })
    
        mikser.options.assets = mikser.config.presets?.assetsFolder || 'assets'
        mikser.options.assetsFolder = path.join(mikser.options.workingFolder, mikser.options.assets)
        logger.info('Assets folder: %s', mikser.options.assetsFolder)
        await mkdir(mikser.options.assetsFolder, { recursive: true })
    
        let link = path.join(mikser.options.outputFolder, mikser.options.assets)
        if (mikser.config.assets?.outputFolder) link = path.join(mikser.options.outputFolder, mikser.config.assets?.outputFolder, mikser.options.assets)
        try {
            await mkdir(path.dirname(link), { recursive: true }) 
            await symlink(mikser.options.assetsFolder, link, 'dir')
        } catch (err) {
            if (err.code != 'EEXIST')
            throw err
        }
    
        watch(collection, mikser.options.presetsFolder)
    })
    
    onSync(collection, async ({ action, context }) => {
        if (!context.relativePath) return false
        const { relativePath } = context
    
        const logger = useLogger()
        const { presets } = mikser.state.assets
        
        const name = relativePath.replace(path.extname(relativePath), '')
        const uri = path.join(mikser.options.presetsFolder, relativePath)
        const source = uri
    
        let synced = true
        switch (action) {
            case ACTION.CREATE:
                try {
                    const { revision = 1, format, options } = await import(`${uri}?stamp=${Date.now()}`)
                    const preset = {
                        id: path.join('/presets', relativePath),
                        collection,
                        type,
                        uri,
                        name: relativePath.replace(path.extname(relativePath), ''),
                        source,
                        format, 
                        checksum: revision,
                        options
                    }
                    presets[name] = preset
                    await createEntity(preset)
                } catch (err) {
                    synced = false
                    logger.error('Preset loading error: %s %s', uri, err.message)
                }
            break
            case ACTION.UPDATE:
                try {
                    const { revision = 1, format, options } = await import(`${uri}?stamp=${Date.now()}`)
                    const preset = {
                        id: path.join('/presets', relativePath),
                        collection,
                        type,
                        uri,
                        name: relativePath.replace(path.extname(relativePath), ''),
                        checksum: revision,
                        source,
                        format,
                        options
                    }
                    if (!preset[name]) {
                        presets[name] = preset
                        await createEntity(preset)
                    } else if (presets[name].checksum != preset.checksum) {
                        presets[name] = preset
                        await updateEntity(preset)
                    } else {
                        synced = false
                    }
                } catch (err) {
                    synced = false
                    logger.error('Preset loading error: %s %s', uri, err.message)
                }
            break
            case ACTION.DELETE:
                delete presets[name]
                await deleteEntity({
                    id: path.join('/presets', relativePath),
                    collection,
                    type,
                })
            break
        }
        return synced
    })
    
    onImport(async () => {
        const logger = useLogger()
        const { presets } = mikser.state.assets
        
        const paths = await globby('*.js', { cwd: mikser.options.presetsFolder })
        for (let relativePath of paths) {
            const uri = path.join(mikser.options.presetsFolder, relativePath)
            const source = uri
            try {
                const { revision = 1, format, options } = await import(`${uri}?stamp=${Date.now()}`)
                const name = relativePath.replace(path.extname(relativePath), '')
                
                const preset = {
                    id: path.join('/presets', relativePath),
                    collection,
                    type,
                    uri,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    source,
                    format, 
                    checksum: revision,
                    options,
                    options
                }
    
                await createEntity(preset)
                presets[name] = preset
            } catch (err) {
                logger.error(err, 'Preset loading error: %s', uri)
            }
        }
    })
    
    onProcessed(async () => {
        const logger = useLogger()
        const { assetsMap } = mikser.state.assets
        
        const entitiesToAdd = useJournal(OPERATION.CREATE, OPERATION.UPDATE)
        .map(operation => operation.entity)
        .filter(entity => entity.collection != collection)
        for (let entity of entitiesToAdd) {
            const entityPresets = await getEntityPresets(entity)
            if (entityPresets.length) {
                logger.debug('Presets matched for: %s %s', entity.collection, entity.id, entityPresets.length)
                assetsMap[entity.id] = entityPresets
            }
        }
    
        const entitiesToRemove = useJournal(OPERATION.DELETE)
        .map(operation => operation.entity)
        .filter(entity => entity.collection != collection)
        for (let entity of entitiesToRemove) {
            delete assetsMap[entity.id]
        }
    })
    
    onBeforeRender(async () => {
        const logger = useLogger()
        const { presets, assetsMap } = mikser.state.assets
        let entitiesToRender = []
        
        const entities = useJournal(OPERATION.CREATE, OPERATION.UPDATE)
        .map(operation => operation.entity)
        for (let entity of entities) {
            if (entity.collection == collection) {
                for (let entityId in assetsMap) {
                    if (assetsMap[entityId].find(preset => preset == entity.name)) {
                        const entityToRender = await findEntity({
                            id: entityId
                        })
                        entitiesToRender.push(entityToRender)
                    }
                }
            } else {
                if (assetsMap[entity.id]) {
                    entitiesToRender.push(entity)
                }
            }
        }
        entitiesToRender = _.uniqBy(entitiesToRender, 'id')
    
        logger.info('Processing assets: %d', entitiesToRender.length)
    
        if (entitiesToRender) {
            checksumMap.clear()
            const checksumFiles = await globby('**/*.md5', { cwd: mikser.options.assetsFolder })
            for (let checksumFile of checksumFiles) {
                checksumMap.add(checksumFile)
            }
        }
        
        const presetRenders = {}
        await Promise.all(entitiesToRender.map(async original => {
            for (let entityPreset of assetsMap[original.id] || []) {
                const entity = _.cloneDeep(original)
                entity.preset = presets[entityPreset]
                let destination = entity.name
                if (entity.preset.format) {
                    destination = destination.replace(`.${entity.format}`, `.${entity.preset.format}`)
                }
                entity.destination = path.join(mikser.options.assetsFolder, entityPreset, destination)
                if (!presetRenders[entity.destination]) {
                    presetRenders[entity.destination] = true
        
                    if (!await isPresetRendered(entity)) {
                        await renderEntity(entity, { ...entity.preset.options, renderer: 'preset' })
                    }
                }
            }
        }))
    
        if (entitiesToRender.length) {
            logger.info('Processing assets completed: %d', entitiesToRender.length)
        }
    })
    
    onAfterRender(async () => {
        const logger = useLogger()
        const entitiesToRender = useJournal(OPERATION.RENDER)
        for(let { result, entity } of entitiesToRender) {
            if (result && entity.preset) {
                await mkdir(path.dirname(entity.destination), { recursive: true })
                const assetChecksum = `${entity.destination}.${entity.preset.checksum}.md5`
                await writeFile(assetChecksum, entity.checksum)
                logger.info('Render finished: %s', result.replace(mikser.options.workingFolder, ''))
            }
        }
    })
    
    onFinalize(async () => {
        const logger = useLogger()
        const { presets } = mikser.state.assets
        
        let revisions = await globby('**/*.md5', { cwd: mikser.options.assetsFolder })
        for (let revision of revisions) {
            const [preset] = revision.split(path.sep)
            const [assetsRevision] = revision.split('.').slice(-2,-1)
    
            if (!presets[preset]) {
                const assetsPresetFolder = path.join(mikser.options.assetsFolder, preset)
                const assetsPresetRemoved = false
                try {
                    await rm(assetsPresetFolder, { recursive: true, force: true })
                    assetsPresetRemoved = true
                } catch {}
                if (assetsPresetRemoved) {
                    logger.debug('Assets preset removed: %s', assetsPresetFolder)
                }
            } else {
                if (Number.parseInt(assetsRevision) < presets[preset].checksum) {
                    await unlink(path.join(mikser.options.assetsFolder, revision))
                }
            }
        }
    })

    return {
        collection,
        type
    }
}
