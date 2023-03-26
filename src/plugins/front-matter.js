import fm from 'front-matter'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    updateEntry,
    constants: { OPERATION }
}) => {
    onProcess(async () => {
        const logger = useLogger()   
        for await (let { id, entity } of useJournal('Fron matter', [OPERATION.CREATE, OPERATION.UPDATE])) {
            if (entity.content && fm.test(entity.content)) {
                const info = fm(entity.content)
                if (info.attributes) {
                    entity.meta = Object.assign(entity.meta || {}, info.attributes)
                    entity.content = info.body
                    await updateEntry({ id, entity })
                    logger.trace('Front matter %s: %s', entity.collection, entity.id)
                }
            }
        }
    })
}