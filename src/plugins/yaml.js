import YAML from 'yamljs'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    constants: { OPERATION },
}) => {
    onProcess(() => {
        const logger = useLogger()
    
        for (let { entity } of useJournal(OPERATION.CREATE, OPERATION.UPDATE)) {
            if (entity.content && (entity.format == 'yml' || entity.format == 'yaml')) {
                entity.meta = Object.assign(entity.meta || {}, YAML.parse(entity.content))
                delete entity.content
                logger.trace('Yaml %s: %s', entity.collection, entity.id)
            }
        }
    })
}