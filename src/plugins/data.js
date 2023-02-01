import _ from 'lodash'
import path from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'

export default ({ 
    onLoaded, 
    useLogger, 
    constants, 
    mikser, 
    useOperations, 
    normalize, 
    findEntities, 
    onAfterRender, 
    onFinalize, 
    onBeforeRender 
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
            const { query, pick, destination = entity => entity.name } = mikser.config.data?.entities[entitiesName]
            const operations = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE, constants.OPERATION_DELETE])
            .filter(({ entity }) => query(entity))
    
            for (let { operation, entity } of operations) {
                const entityName = destination(entity)
                const entityFile = path.join(mikser.options.dataFolder, entityName ,`${entitiesName}.json`)
                switch (operation) {
                    case constants.OPERATION_CREATE:
                    case constants.OPERATION_UPDATE:
                        logger.debug('Data export entity %s %s: %s', entity.collection, operation, entity.id)
                        const normalized = pick ? normalize(_.pick(entity, pick)) : entity
                    
                        await mkdir(path.dirname(entityFile), { recursive: true })
                        await writeFile(entityFile, JSON.stringify(normalized), 'utf8')
                    break
                    case constants.OPERATION_DELETE:
                        await unlink(entityFile)
                    break
                }
            }
        }
    })
    
    onAfterRender(async () => {
        const logger = useLogger()
    
        const operations = useOperations([constants.OPERATION_RENDER])
        for (let contextName in mikser.config.data?.context || {}) {
            const { query, pick, destination = entity => entity.name } = mikser.config.data?.context[contextName]
            const contextOperations = operations
            .filter(({ entity }) => query(entity))
            for(let { entity, context } of contextOperations) {
                const entityName = destination(entity)
                logger.debug('Data export context: %s', entityName)
    
                const entityFile = path.join(mikser.options.dataFolder, entityName, `${contextName}.json`)
                const normalized = pick ? normalize(_.pick(context, pick)) : context
        
                await mkdir(path.dirname(entityFile), { recursive: true })
                await writeFile(entityFile, JSON.stringify(normalized), 'utf8')
            }
        }
    })
    
    onFinalize(async () => {
        const logger = useLogger()
        for (let dataName in mikser.config.data?.database || {}) {
            const { query, pick } = mikser.config.data?.database[dataName]
            const entities = await findEntities(query)
            const entitiesFile = path.join(mikser.options.dataFolder, `${dataName}.json`)
            const dataEntities = entities.map(entity => pick ? _.pick(entity, pick) : entity)
            logger.debug('Data export database %s %s: %s', dataName, dataEntities.length, entitiesFile)
            await writeFile(entitiesFile, JSON.stringify(dataEntities), 'utf8')
        }
    })
}