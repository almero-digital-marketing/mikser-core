import path from 'node:path'
import { mkdir, writeFile, unlink, rm, readFile, symlink, } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import map from 'p-map'

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
    onComplete, 
    onSync, 
    onFinalize, 
    findEntity,
    matchEntity,
    changeExtension,
    constants: { ACTION, OPERATION }, 
}) => {
    const collection = 'presets'
    const type = 'preset'
    const checksumMap = new Set()
    
    async function getEntityPresets(entity) {
        const entityPresets = []
        for(let preset in (mikser.config.assets?.presets || {})) {
            const matches = Array.isArray(mikser.config.assets.presets[preset]) ? mikser.config.assets.presets[preset] : [mikser.config.assets.presets[preset]]
            for (let match of matches) {
                if (matchEntity(entity, match)) {
                    entityPresets.push(preset)
                }
            }
        }
        return entityPresets
    }
    
    async function getRevisions(entity) {
        let revisions = await globby(`${entity.destination.replaceAll('(','\\(').replaceAll(')','\\)')}.*.md5`, { 
            cwd: path.join(mikser.options.assetsFolder, entity.preset.name), 
            expandDirectories: false, 
            onlyFiles: true 
        })
        return revisions
    }
    
    async function isPresetRendered(entity) {
        let result = false
        let revisions = []
        const assetChecksum = `${entity.destination}.${entity.preset.checksum}.md5`
        if (checksumMap.has(assetChecksum)) {
            revisions.push(assetChecksum)
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

    async function renderPresets(entityToRender) {
        const { presets, assetsMap } = mikser.state.assets

        for (let entityPreset of assetsMap[entityToRender.id] || []) {
            const entity = _.cloneDeep(entityToRender)
            entity.preset = presets[entityPreset]
            let destination = entity.name
            if (entity.preset.format) {
                destination = changeExtension(destination, entity.preset.format)
            }
            entity.destination = path.join(mikser.options.assetsFolder, entityPreset, destination)
            const ignore = await isPresetRendered(entity)
            await renderEntity(entity, { 
                ...entity.preset.options, 
                renderer: 'preset',
                ignore
            })
        }
    }
    
    onLoaded(async () => {
        const logger = useLogger()
        
        mikser.state.assets = {
            presets: {},
            assetsMap: {},
            assetsFolder: mikser.config.assets?.assetsFolder || 'assets',
        }
    
        mikser.options.presets = mikser.config.presets?.presetsFolder || collection
        mikser.options.presetsFolder = path.join(mikser.options.workingFolder, mikser.options.presets)
        logger.info('Presets folder: %s', mikser.options.presetsFolder)
        await mkdir(mikser.options.presetsFolder, { recursive: true })
    
        mikser.options.assets = mikser.config.assets?.assetsFolder || 'assets'
        mikser.options.assetsFolder = path.join(mikser.options.workingFolder, mikser.options.assets)
        logger.info('Assets folder: %s', mikser.options.assetsFolder)
        await mkdir(mikser.options.assetsFolder, { recursive: true })
    
        let link = path.join(mikser.options.outputFolder, mikser.options.assets)
        if (mikser.config.assets?.outputFolder) link = path.join(mikser.options.outputFolder, mikser.config.assets?.outputFolder, mikser.options.assets)
        try {
            await mkdir(path.dirname(link), { recursive: true }) 
            await symlink(path.resolve(mikser.options.assetsFolder), link, 'dir')
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
    
    onProcessed(async (signal) => {
        const logger = useLogger()
        const { assetsMap } = mikser.state.assets
        
        for await (let { entity, operation } of useJournal('Assets processing', [OPERATION.CREATE, OPERATION.UPDATE, OPERATION.DELETE], signal)) {
            if (entity.collection != collection) {
                switch (operation) {
                    case OPERATION.CREATE:
                    case OPERATION.UPDATE:
                        const entityPresets = await getEntityPresets(entity)
                        if (entityPresets.length) {
                            logger.debug('Presets matched for: %s %s', entity.collection, entity.id, entityPresets.length)
                            assetsMap[entity.id] = entityPresets
                        }
                    break
                    case OPERATION.DELETE:
                        delete assetsMap[entity.id]
                    break
                }
            }
        }
    })
    
    onBeforeRender(async signal => {
        const { assetsMap } = mikser.state.assets

        checksumMap.clear()
        const checksumFiles = await globby('**/*.md5', { cwd: mikser.options.assetsFolder })
        for (let checksumFile of checksumFiles) {
            checksumMap.add(path.join(mikser.options.assetsFolder, checksumFile))
        }

        const entitiesToRender = new Set()
        await map(useJournal('Assets provision', [OPERATION.CREATE, OPERATION.UPDATE], signal), async ({ entity }) => {
            if (entity.collection == collection) {
                for (let entityId in assetsMap) {
                    if (assetsMap[entityId].find(preset => preset == entity.name)) {
                        const entityToRender = await findEntity({
                            id: entityId
                        })
                        if (!entitiesToRender.has(entityToRender.id)) {
                            entitiesToRender.add(entityToRender.id)
                            await renderPresets(entityToRender)
                        }
                    }
                }
            } else {
                if (assetsMap[entity.id] && !entitiesToRender.has(entity.id)) {
                    entitiesToRender.add(entity.id)
                    await renderPresets(entity)
                }
            }
        }, { concurrency: 10, signal })
    })
    
    onComplete(async ({ entity, options }) => {
        const logger = useLogger()
        if (entity.preset && !options?.ignore) {
            await mkdir(path.dirname(entity.destination), { recursive: true })
            const assetChecksum = `${entity.destination}.${entity.preset.checksum}.md5`
            await writeFile(assetChecksum, entity.checksum, 'utf8')
            logger.debug('Asset render finished: [%s] %s', assetChecksum, entity.destination.replace(mikser.options.workingFolder, ''))
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
