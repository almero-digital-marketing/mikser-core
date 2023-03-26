export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    updateEntry,
    constants: { OPERATION }
}) => {
    onProcess(async () => {
        const logger = useLogger()
    
        for await (let { id, entity } of useJournal('Json', [OPERATION.CREATE, OPERATION.UPDATE])) {
            if (entity.content && entity.format == 'json') {
                entity.meta = Object.assign(entity.meta || {}, JSON.parse(entity.content))
                delete entity.content
                await updateEntry({ id, entity })
                logger.trace('Json %s: %s', entity.collection, entity.id)
            }
        }
    })
}