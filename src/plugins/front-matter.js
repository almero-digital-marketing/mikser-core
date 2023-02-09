import fm from 'front-matter'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    constants: { OPERATION }
}) => {
    onProcess(() => {
        const logger = useLogger()   
        for (let { entity } of useJournal(OPERATION.CREATE, OPERATION.UPDATE)) {
            if (entity.content && fm.test(entity.content)) {
                const info = fm(entity.content)
                if (info.attributes) {
                    entity.meta = Object.assign(entity.meta || {}, info.attributes)
                    entity.content = info.body
                    logger.trace('Front matter %s: %s', entity.collection, entity.id)
                }
            }
        }
    })
}