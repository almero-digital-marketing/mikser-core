import { mikser, useLogger, onImport, onLoaded, onSync, createEntity, updateEntity, deleteEntity, findEntity, findEntities, schedule, constants, normalize } from '../../index.js'
import path from 'path'
import hasha from 'hasha'
import _ from 'lodash'

const format = 'api'

async function syncEntities(apiName) {
    const logger = useLogger()
    const syncTime = Date.now()
    let synced = 0
    let removed = 0
    const { collection, type, readMany, uri = '/' } = mikser.config.api[apiName]
    const recent = new Set()
    const entities = await readMany(mikser)
    for (let meta of entities) {
        if (collection && type) {
            const relativePath = path.join(collection, apiName, meta.id)
            const id = path.join('/api', relativePath)
            if (recent.has(id)) {
                logger.error(meta, 'Duplicate entity found: %s', apiName)
                continue
            }
            recent.add(id)
            const entity = normalize({
                id,
                uri: uri + meta.id,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection,
                type,
                format,
                meta
            })
            entity.checksum = await hasha(JSON.stringify(entity.meta), { algorithm: 'md5' })
            const current = await findEntity({ id })
            if (current) {
                if (entity.checksum != current.checksum) {
                    await updateEntity(entity)
                    synced++
                }
            } else {
                await createEntity(entity)
                synced++
            }
        }
    }

    const entitiesToRemove = await findEntities(entity => 
        entity.type == type && 
        entity.format == format && 
        entity.collection == collection && 
        entity.time < syncTime && 
        !recent.has(entity.id)
    )
    for (let entity of entitiesToRemove) {
        deleteEntity(entity)
        removed++
    }
    if (synced || removed) {
        logger.info('Syncing api: [%s] synced: %d, removed: %d', apiName, synced, removed)
    }
    return synced > 0 || removed > 0
}

onLoaded(async () => {
    const logger = useLogger()
    for (let apiName in mikser.config.api || {}) {
        const { cron } = mikser.config.api[apiName]
        if (cron) {
            logger.info('Schedule api: [%s] %s', apiName, cron)
            schedule(apiName, cron)
        }
    }
})

onSync(async ({ name, operation }) => {
    if (operation == constants.OPERATION_SCHEDULE) {
        return await syncEntities(name)
    }
})

onImport(async () => {
    for (let apiName in mikser.config.api || {}) {
        await syncEntities(apiName)
    }
})