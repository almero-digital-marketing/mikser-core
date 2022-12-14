import { mikser, onLoaded, useLogger, onImport, watchEntities, onProcessed, onBeforeRender, useOperations, createEntity, updateEntity, deleteEntity, renderEntity, onAfterRender, constants, onSync, onFinalize, findEntity } from '../index.js'
import path from 'node:path'
import { mkdir, writeFile, unlink, rm, readFile, symlink } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import minimatch from 'minimatch'

export const collection = 'presets'
export const type = 'preset'

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
    let revisions = await globby(`${entity.destination}.*.md5`, { cwd: path.join(mikser.options.assetsFolder, entity.preset.name) })
    return revisions
}

async function isPresetRendered(entity) {
    let result = false
    const revisions = await getRevisions(entity)
    for (let revision of revisions) {
        const [assetsRevision] = revision.split('.').slice(-2,-1)
        if (entity.preset.checksum <= Number.parseInt(assetsRevision)) {
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

    mikser.options.presets = mikser.config.presets?.presets || collection
    mikser.options.presetsFolder = path.join(mikser.options.workingFolder, mikser.options.presets)
    logger.info('Presets folder: %s', mikser.options.presetsFolder)
    await mkdir(mikser.options.presetsFolder, { recursive: true })

    mikser.options.assets = mikser.config.presets?.assets || 'assets'
    mikser.options.assetsFolder = path.join(mikser.options.workingFolder, mikser.options.assets)
    logger.info('Assets folder: %s', mikser.options.assetsFolder)
    await mkdir(mikser.options.assetsFolder, { recursive: true })

    let link = path.join(mikser.options.outputFolder, mikser.options.assets)
    if (mikser.config.assets?.output) link = path.join(mikser.options.outputFolder, mikser.config.assets?.output, mikser.options.assets)
    try {
        await mkdir(path.dirname(link), { recursive: true }) 
        await symlink(mikser.options.assetsFolder, link, 'dir')
    } catch (err) {
        if (err.code != 'EEXIST')
        throw err
    }

    watchEntities(collection, mikser.options.presetsFolder)
})

onSync(async ({ id, operation, relativePath }) => {
    const logger = useLogger()
	const { presets } = mikser.state.assets
	
    const name = relativePath.replace(path.extname(relativePath), '')
    const uri = path.join(mikser.options.presetsFolder, relativePath)
    const source = uri

    let synced = true
    switch (operation) {
        case constants.OPERATION_CREATE:
            try {
                const { revision = 1, format } = await import(`${uri}?stamp=${Date.now()}`)
                const preset = {
                    id: path.join('/presets', relativePath),
                    collection,
                    type,
                    uri,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    source,
                    format, 
                    checksum: revision
                }
                presets[name] = preset
                await createEntity(preset)
            } catch (err) {
                synced = false
                logger.error('Preset loading error: %s %s', uri, err.message)
            }
        break
        case constants.OPERATION_UPDATE:
            try {
                const { revision = 1, format } = await import(`${uri}?stamp=${Date.now()}`)
                const preset = {
                    id: path.join('/presets', relativePath),
                    collection,
                    type,
                    uri,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    checksum: revision,
                    source,
                    format
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
        case constants.OPERATION_DELETE:
            delete presets[name]
            await deleteEntity({
                id,
                collection,
                type,
            })
        break
    }
    return synced
}, collection)

onImport(async () => {
    const logger = useLogger()
	const { presets } = mikser.state.assets
	
    const paths = await globby('*.js', { cwd: mikser.options.presetsFolder })
    for (let relativePath of paths) {
        const uri = path.join(mikser.options.presetsFolder, relativePath)
        const source = uri
        try {
            const { revision = 1, format } = await import(`${uri}?stamp=${Date.now()}`)
            const name = relativePath.replace(path.extname(relativePath), '')
            
            const preset = {
                id: path.join('/presets', relativePath),
                collection,
                type,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                source,
                format, 
                checksum: revision
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
	
    const entitiesToAdd = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.collection != collection)
    for (let entity of entitiesToAdd) {
        const entityPresets = await getEntityPresets(entity)
        if (entityPresets.length) {
            logger.debug('Presets matched for: %s %s', entity.collection, entity.id, entityPresets.length)
            assetsMap[entity.id] = entityPresets
        }
    }

    const entitiesToRemove = useOperations([constants.OPERATION_DELETE])
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
    
    const entities = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
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
	
    const presetRenders = {}
    for (let original of entitiesToRender) {
        for (let entityPreset of assetsMap[original.id] || []) {
            const entity = _.cloneDeep(original)
            entity.preset = presets[entityPreset]
            let entityName = entity.name
            if (entity.preset.format) {
                entityName = entity.name.replace(`.${entity.format}`, `.${entity.preset.format}`)
            }
            entity.destination = path.join(mikser.options.assetsFolder, entityPreset, entityName)
            if (!presetRenders[entity.destination]) {
                presetRenders[entity.destination] = true

                if (!await isPresetRendered(entity)) {
                    await renderEntity(entity, 'preset')
                }
            }
        }
    }
})

onAfterRender(async () => {
    const logger = useLogger()
    const entitiesToRender = useOperations(['render'])
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