import { mikser, useLogger, onImport, onLoaded, onSync, createEntity, updateEntity, deleteEntity, findEntity, findEntities, schedule, constants, normalize, } from '../../index.js'
import path from 'path'
import hasha from 'hasha'
import _ from 'lodash'

const format = 'api'

async function syncEntities(apiName) {
    const logger = useLogger()
    const syncTime = Date.now()
    const { 
        collection = apiName, 
        type = 'document', 
        readMany, 
        uri = '' 
    } = mikser.config.api[apiName]
    
    let synced = 0
    let removed = 0
    try {
        const recent = new Set()
        const entities = await readMany(mikser)
        for (let meta of entities) {
            if (collection && type && meta.id) {
                const name = path.join(collection, meta.name || meta.id.toString())
                const id = path.join('/api', collection, meta.id.toString())
                if (recent.has(id)) {
                    logger.error(meta, 'Duplicate entity found: %s', id)
                    continue
                }
                recent.add(id)
                const entity = normalize({
                    id,
                    uri: `${uri}/${meta.id}`,
                    name,
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
            logger.info('Syncing api: [%s] synced: %d, removed: %d', collection, synced, removed)
        }
    } catch (err) {
        logger.error('Api sync entities error: %s', err.message)
    }
    return synced > 0 || removed > 0
}

async function syncEntity(apiName, apiId) {
    const logger = useLogger()
    const { 
        collection = apiName, 
        type = 'document', 
        readOne, 
        uri = '' 
    } = mikser.config.api[apiName]

    try {
        const id = path.join('/api', collection, apiId.toString())
        const current = await findEntity({ id })
        const meta = await readOne(apiId, mikser)
        if (meta?.id) {
            const name = path.join(collection, meta.name || meta.id.toString())
            const entity = normalize({
                id,
                uri: `${uri}/${meta.id}`,
                name,
                collection,
                type,
                format,
                meta
            })
            entity.checksum = await hasha(JSON.stringify(entity.meta), { algorithm: 'md5' })
            if (current) {
                if (entity.checksum != current.checksum) {
                    logger.info('Api update: %s', id)
                    await updateEntity(entity)
                }
            } else {
                logger.info('Api create: %s', id)
                await createEntity(entity)
            }
        } else {
            if (current) {
                logger.info('Api delete: %s', id)
                await deleteEntity(entity)
            }
        }
    } catch (err) {
        logger.error('Api sync entity error: %s', err.message)
    }
}

onLoaded(async () => {
    const logger = useLogger()
    for (let apiName in mikser.config.api || {}) {
        const { cron } = mikser.config.api[apiName]
        if (cron) {
            logger.info('Schedule api: [%s] %s', apiName, cron)
            schedule(apiName, cron)
        }
        onSync(async ({ context }) => {
            if (context?.id) {
                return syncEntity(apiName, context.id)
            }
        }, apiName)
    }
})

onSync(async ({ name, operation, context }) => {
    const logger = useLogger()
    if (operation == constants.OPERATION_SCHEDULE) {
        if (name) {
            logger.info('Syncing api: [%s]', name)
            return await syncEntities(name)
        } else {
            for (let apiName in mikser.config.api || {}) {
                if (context.uri && mikser.config.api[apiName].uri.indexOf(context.uri) != 0) continue

                logger.info('Syncing api: [%s]: %s', apiName, context.uri)
                await syncEntities(apiName)
            }
        }
    }
})

onImport(async () => {
    for (let apiName in mikser.config.api || {}) {
        await syncEntities(apiName)
    }
})