import _ from 'lodash'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    mikser,
    constants: { OPERATION }, 
}) => {
    onProcess(() => {
        const logger = useLogger()
    
        for (let { match, map, operations = [OPERATION.CREATE, OPERATION.UPDATE] } of mikser.config.mapper?.mappers || []) {               
            for (let { entity } of useJournal(...operations)) {
                if (entity.meta && _.isMatch(entity, match)) {
                    logger.trace('Mapper: %s', entity.id)
                    try {
                        map(entity)
                    } catch (err) {
                        logger.error('Mapper error: %s %s', entity.name || entity.id, err.message)
                    }
                }
            }
        }
    })
}