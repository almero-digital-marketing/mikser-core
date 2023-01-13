import { onProcess, useLogger, useOperations, constants } from '../../index.js'
import YAML from 'yamljs'

onProcess(() => {
    const logger = useLogger()
    const entities = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.content && (entity.format == 'yml' || entity.format == 'yaml'))

    for (let entity of entities) {
        entity.meta = Object.assign(entity.meta || {}, YAML.parse(entity.content))
        delete entity.content
        logger.trace('Yaml %s: %s', entity.collection, entity.id)
    }
})