import { mikser, onLoaded, useLogger, onImport, watchEntities, onProcessed, onBeforeRender, useOperations, renderEntity, onAfterRender, constants, onSync, onFinalize, findEntities, userPlugins } from '../index.js'
import path from 'path'
import { mkdir, writeFile, unlink, rm, readFile, symlink } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import minimatch from 'minimatch'

let presets = {}
let assetsMap = {}

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
        if (entity.preset.revision <= assetsRevision) {
            let checksum = await readFile(revision, 'utf8')
            result ||= checksum == entity.checksum
            if (result) break
        }
    }
    return result
}

onLoaded(async () => {
    const logger = useLogger()

    mikser.options.presetsFolder = mikser.config.assets?.presetsFolder || path.join(mikser.options.workingFolder, 'presets')
    logger.info('Presets: %s', mikser.options.presetsFolder)
    await mkdir(mikser.options.presetsFolder, { recursive: true })

    mikser.options.assetsFolder = mikser.config.assets?.assetsFolder || path.join(mikser.options.workingFolder, 'assets')
    logger.info('Assets: %s', mikser.options.assetsFolder)
    await mkdir(mikser.options.assetsFolder, { recursive: true })

    watchEntities('presets', mikser.options.presetsFolder)
})

onSync(async ({ id, operation }) => {
    const logger = useLogger()
    const relativePath = id.replace('/presets/', '')
    const name = relativePath.replace(path.extname(relativePath), '')
    let synced = true
    switch (operation) {
        case constants.OPERATION_CREATE:
        case constants.OPERATION_UPDATE:
            const uri = path.join(mikser.options.presetsFolder, relativePath)
            try {
                const { revision = 1, format } = await import(`${uri}?v=${Date.now()}`)
                const preset = {
                    id: path.join('/presets', relativePath),
                    uri,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    revision,
                    format
                }
                if (!presets[name] || presets[name].revision != preset.revision) {
                    presets[name] = preset
                } else {
                    synced = false
                }
            } catch (err) {
                logger.error(err, 'Preset loading error: %s', uri)
            }
        break
        case constants.OPERATION_DELETE:
            delete presets[name]
        break
    }
    return synced
}, 'presets')

onImport(async () => {
    const logger = useLogger()
    const paths = await globby('*.js', { cwd: mikser.options.presetsFolder })
    for (let relativePath of paths) {
        const uri = path.join(mikser.options.presetsFolder, relativePath)
        try {
            const { revision = 1, format } = await import(`${uri}?v=${Date.now()}`)
            const name = relativePath.replace(path.extname(relativePath), '')
            presets[name] = {
                id: path.join('/presets', relativePath),
                uri,
                name,
                revision,
                format
            }
        } catch (err) {
            logger.error(err, 'Preset loading error: %s', uri)
        }
    }

    const uri = path.join(mikser.options.outputFolder, 'assets')
    try {
        await mkdir(mikser.options.outputFolder, { recursive: true }) 
        await symlink(mikser.options.assetsFolder, uri, 'dir')
    } catch (err) {
        if (err.code != 'EEXIST')
        throw err
    }

})

onProcessed(async () => {
    const logger = useLogger()
    const entitiesToAdd = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    for (let entity of entitiesToAdd) {
        const entityPresets = await getEntityPresets(entity)
        if (entityPresets.length) {
            logger.debug('Presets matched for: %s %s', entity.collection, entity.id, entityPresets.length)
            assetsMap[entity.id] = entityPresets
        }
    }

    const entitiesToRemove = useOperations([constants.OPERATION_DELETE])
    .map(operation => operation.entity)
    for (let entity of entitiesToRemove) {
        delete assetsMap[entity.id]
    }
})

onBeforeRender(async () => {
    const entities = await findEntities()
    for (let original of entities) {
        for (let entityPreset of assetsMap[original.id] || []) {
            const entity = _.cloneDeep(original)
            entity.preset = presets[entityPreset]
            let entityName = entity.name
            if (entity.preset.format) {
                entityName = entity.name.replace(`.${entity.format}`, `.${entity.preset.format}`)
            }
            entity.destination = path.join(mikser.options.assetsFolder, entityPreset, entityName)
            if (!await isPresetRendered(entity)) {
                await renderEntity(entity, 'preset')
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
            const assetChecksum = `${entity.destination}.${entity.preset.revision}.md5`
            await writeFile(assetChecksum, entity.checksum)
            logger.info('Render finished: %s', result.replace(mikser.options.workingFolder, ''))
        }
    }
})

onFinalize(async () => {
    const logger = useLogger()
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
            if (Number.parseInt(assetsRevision) < presets[preset].revision) {
                await unlink(path.join(mikser.options.assetsFolder, revision))
            }
        }
    }
})