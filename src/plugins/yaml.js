import { onProcess, useLogger, useOperations } from '../index.js'
import YAML from 'yamljs'

onProcess(() => {
    const logger = useLogger()
    const entities = useOperations(['create', 'update'])
    .map(operation => operation.entity)
    .filter(entity => entity.source && (entity.format == 'yml' || entity.format == 'yaml'))

    for (let entity of entities) {
        entity.meta = Object.assign(entity.meta || {}, YAML.parse(entity.source))
        delete entity.source
        logger.trace('Yaml %s: %s', entity.collection, entity.id)
    }
})