import { onProcess, useLogger, useOperations, constants, mikser } from '../../index.js'
import _ from 'lodash'

onProcess(() => {
    const logger = useLogger()

    for (let { match, map, use = 'meta', operations = [constants.OPERATION_CREATE, constants.OPERATION_UPDATE] } of mikser.config.mapper?.mappers || []) {        
        const entities = useOperations(operations)
        .map(operation => operation.entity)
        .filter(entity => entity.meta && _.isMatch(entity, match))
    
        for (let entity of entities) {
            logger.trace('Mapper: %s', entity.id)
            const object = _.get(entity, use)
            if (map) {
                _.set(entity, use, map(object))
            }
        }
    }
})