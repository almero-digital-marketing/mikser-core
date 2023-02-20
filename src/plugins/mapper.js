import _ from 'lodash'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    matchEntity,
    mikser,
    constants: { OPERATION }, 
}) => {
    onProcess(async () => {
        const logger = useLogger()
    
        for (let { match, map, operations = [OPERATION.CREATE, OPERATION.UPDATE] } of mikser.config.mapper?.mappers || []) {               
            for (let { entity } of useJournal(...operations)) {
                if (entity.meta && matchEntity(entity, match)) {
                    logger.trace('Mapper: %s', entity.id)
                    try {
                        await map(entity)
                    } catch (err) {
                        logger.error('Mapper error: %s %s', entity.name || entity.id, err.message)
                    }
                }
            }
        }
    })
}