import path from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import _ from 'lodash'
import pMap from 'p-map'

export default ({ 
    onLoaded, 
    useLogger, 
    mikser, 
    useJournal, 
    normalize, 
    findEntities, 
    onAfterRender, 
    onFinalize, 
    onBeforeRender,
    constants: { OPERATION }, 
}) => {
    onLoaded(async () => {
        const logger = useLogger()
        mikser.options.data = mikser.config.data?.dataFolder || 'data'
        mikser.options.dataFolder = path.join(mikser.options.workingFolder, mikser.options.data)
    
        logger.info('Data folder: %s', mikser.options.dataFolder)
        await mkdir(mikser.options.dataFolder, { recursive: true })
    })
    
    onBeforeRender(async () => {
        const logger = useLogger()
    
        let entitiesConfig = mikser.config.data?.entities || {}
        if (entitiesConfig === true) {
            entitiesConfig = {
                document: {
                    query: entity => entity.type == 'document'
                }
            }
        }
        for (let entitiesName in entitiesConfig) {
            const { 
                query, 
                map, 
                pick,
                save : saveEntity = async entity => {
                    if (!entity.name) {
                        logger.warn('Entity name is missing: %o', entity)
                        return
                    }
                    const dump = JSON.stringify(normalize(entity))
                    const entityFile = path.join(mikser.options.dataFolder,`${entity.name}.${entitiesName}.json`)
                    await mkdir(path.dirname(entityFile), { recursive: true })
                    await writeFile(entityFile, dump, 'utf8')
                },
                delete : deleteEntity = async entity => {
                    const entityFile = path.join(mikser.options.dataFolder,`${entity.name}.json`)
                    await unlink(entityFile)
                }
            } = entitiesConfig[entitiesName]

            for await (let { operation, entity } of useJournal('Data entities', [OPERATION.CREATE, OPERATION.UPDATE, OPERATION.DELETE])) {
                if (query(entity)) {
                    switch (operation) {
                        case OPERATION.CREATE:
                        case OPERATION.UPDATE:
                            logger.debug('Data export entity %s %s: %s', entity.collection, operation, entity.id)
                            await saveEntity(map ? await map(entity) : {
                                refId: ('/' + entity.name.replaceAll('\\','/')).replace(/\/index$/g,'/'),
                                name: entity.name,
                                date: new Date(entity.time),
                                data: _.pick(entity, pick || ['collection', 'format', 'type', 'destination', 'stamp', 'meta', 'id',])
                            })
                        break
                        case OPERATION.DELETE:
                            await deleteEntity(entity)
                        break
                    }
                }
            }
        }
    })
    
    onAfterRender(async () => {
        const logger = useLogger()

        let contextConfig = mikser.config.data?.context || {}
        if (contextConfig === true) {
            contextConfig = {
                context: {
                    query: entity => entity.type == 'document'
                }
            }
        }
        for (let contextName in contextConfig) {
            const { 
                query, 
                map,
                pick,
                save: saveConext = async (entity, context) => {                    
                    if (context?.data) {
                        const entityName = entity.name
                        const contextFile = path.join(mikser.options.dataFolder, `${entityName}.${contextName}.json`)
                        await mkdir(path.dirname(contextFile), { recursive: true })
                        await writeFile(contextFile, JSON.stringify(context), 'utf8')
                    }
                }
            } = contextConfig[contextName]

            for await (let { entity, context } of useJournal('Data context', [OPERATION.RENDER])) {
                if (query(entity)) {
                    logger.debug('Data export context: %s', entity.name)
                    await saveConext(entity, map ? await map(entity, context) : _.pick(context, pick || ['data']))
                }
            }
        }
    })
    
    onFinalize(async () => {
        const logger = useLogger()
        for (let catalogName in mikser.config.data?.catalog || {}) {
            const { 
                query: queryEntities = entity => entity.type == 'document', 
                map,
                pick,
                save: saveEntities = async entities => {
                    const entitiesFile = path.join(mikser.options.dataFolder, `${catalogName}.json`)
                    logger.debug('Data export catalog %s %s: %s', catalogName, entities.length, entitiesFile)
                    await writeFile(entitiesFile, JSON.stringify(entities), 'utf8')
                }
            } = mikser.config.data?.catalog[catalogName]
            const entities = await findEntities(queryEntities)
            await saveEntities(await pMap(entities, async entity => map ? await map(entity) : {
                refId: ('/' + entity.name.replaceAll('\\','/')).replace(/\/index$/g,'/'),
                name: entity.name,
                date: new Date(entity.time),
                data: _.pick(entity, pick || ['collection', 'format', 'type', 'destination', 'stamp', 'meta', 'id',])
            }))
        }
    })
}