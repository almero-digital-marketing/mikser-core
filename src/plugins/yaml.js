import YAML from 'yaml'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    updateEntry,
    constants: { OPERATION },
}) => {
    onProcess(async (signal) => {
        const logger = useLogger()
    
        for await (let { id, entity } of useJournal('Yaml', [OPERATION.CREATE, OPERATION.UPDATE], signal)) {
            if (entity.content && (entity.format == 'yml' || entity.format == 'yaml')) {
                try {
                    entity.meta = Object.assign(entity.meta || {}, YAML.parse(entity.content))
                    delete entity.content
                    logger.trace('Yaml %s: %s', entity.collection, entity.id)
                    await updateEntry({ id, entity })
                } catch (err) {
                    logger.error('Yaml error %s: %s %s', entity.collection, entity.id, err.message)
                }
            }
        }
    })
}