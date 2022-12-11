import { onProcess, useLogger, useOperations, constants } from '../index.js'

onProcess(() => {
    const logger = useLogger()
    const entities = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.source && entity.format == 'json')

    for (let entity of entities) {
        entity.meta = Object.assign(entity.meta || {}, JSON.parse(entity.source))
        delete entity.source
        logger.trace('Json %s: %s', entity.collection, entity.id)
    }
})