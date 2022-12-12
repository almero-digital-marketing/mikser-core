import { onProcess, useLogger, useOperations, constants } from '../index.js'
import fm from 'front-matter'

onProcess(() => {
    const logger = useLogger()
    const entities = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.source && fm.test(entity.source))

    for (let entity of entities) {
        const info = fm(entity.source)
        entity.meta = Object.assign(entity.meta, info.attributes)
        entity.source = info.body
        logger.trace('Front matter %s: %s', entity.collection, entity.id)
    }
})