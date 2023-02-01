import _ from 'lodash'

export default ({ 
    onProcess, 
    useLogger, 
    useOperations, 
    constants, 
    mikser 
}) => {
    onProcess(() => {
        const logger = useLogger()
    
        for (let { match, map, operations = [constants.OPERATION_CREATE, constants.OPERATION_UPDATE] } of mikser.config.mapper?.mappers || []) {        
            const entities = useOperations(operations)
            .map(operation => operation.entity)
            .filter(entity => entity.meta && _.isMatch(entity, match))
        
            for (let entity of entities) {
                logger.trace('Mapper: %s', entity.id)
                try {
                    map(entity)
                } catch (err) {
                    logger.error('Mapper error: %s %s', entity.name || entity.id, err.message)
                }
            }
        }
    })
}