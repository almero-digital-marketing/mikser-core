import path from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'

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
    
        for (let entitiesName in mikser.config.data?.entities || {}) {
            const { 
                query, 
                map, 
                save : saveEntity = async entity => {
                    if (!entity.name) {
                        logger.warn('Entity name is missing: %o', entity)
                        return
                    }
                    const dump = JSON.stringify(normalize(entity))
                    const entityFile = path.join(mikser.options.dataFolder, entity.name ,`${entity.name}.json`)
                    await mkdir(path.dirname(entityFile), { recursive: true })
                    await writeFile(entityFile, dump, 'utf8')
                },
                delete : deleteEntity = async entity => {
                    const entityFile = path.join(mikser.options.dataFolder, entity.name ,`${entity.name}.json`)
                    await unlink(entityFile)
                }
            } = mikser.config.data?.entities[entitiesName]

            for (let { operation, entity } of useJournal(OPERATION.CREATE, OPERATION.UPDATE, OPERATION.DELETE)) {
                if (query(entity)) {
                    switch (operation) {
                        case OPERATION.CREATE:
                        case OPERATION.UPDATE:
                            logger.debug('Data export entity %s %s: %s', entity.collection, operation, entity.id)
                            await saveEntity(map ? map(entity) : entity)
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
    
        for (let contextName in mikser.config.data?.context || {}) {
            const { 
                query, 
                map,
                save: saveConext = async (entity, context) => {
                    const entityName = entity.name
                    const contextFile = path.join(mikser.options.dataFolder, entityName, `${contextName}.json`)
        
                    await mkdir(path.dirname(contextFile), { recursive: true })
                    await writeFile(contextFile, JSON.stringify(context), 'utf8')
                }
            } = mikser.config.data?.context[contextName]

            for(let { entity, context } of useJournal(OPERATION.RENDER)) {
                if (query(entity)) {
                    logger.debug('Data export context: %s', entityName)
                    await saveConext(entity, map ? map(context) : context)
                }
            }
        }
    })
    
    onFinalize(async () => {
        const logger = useLogger()
        for (let dataName in mikser.config.data?.database || {}) {
            const { 
                query, 
                map,
                save: saveEntities = async entities => {
                    const entitiesFile = path.join(mikser.options.dataFolder, `${dataName}.json`)
                    logger.debug('Data export database %s %s: %s', dataName, dataEntities.length, entitiesFile)
                    await writeFile(entitiesFile, JSON.stringify(entities), 'utf8')
                }
            } = mikser.config.data?.database[dataName]
            const entities = await findEntities(query).map(entity => map ? map(entity) : entity)
            logger.debug('Data export database: %s %s', dataName, dataEntities.length)
            await saveEntities(entities)
        }
    })
}