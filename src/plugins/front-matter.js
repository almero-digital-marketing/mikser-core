import fm from 'front-matter'

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    constants: { OPERATION }
}) => {
    onProcess(() => {
        const logger = useLogger()
        const entities = useJournal(OPERATION.CREATE, OPERATION.UPDATE)
        .map(operation => operation.entity)
        .filter(entity => entity.content && fm.test(entity.content))
    
        for (let entity of entities) {
            const info = fm(entity.content)
            if (info.attributes) {
                entity.meta = Object.assign(entity.meta || {}, info.attributes)
                entity.content = info.body
                logger.trace('Front matter %s: %s', entity.collection, entity.id)
            }
        }
    })
}