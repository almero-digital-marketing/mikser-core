import { entries } from "lodash"

export default ({ 
    onProcess, 
    useLogger, 
    useJournal, 
    constants: { OPERATION }
}) => {
    onProcess(() => {
        const logger = useLogger()
    
        for (let { entity } of useJournal(OPERATION.CREATE, OPERATION.UPDATE)) {
            if (entity.content && entity.format == 'json') {
                entity.meta = Object.assign(entity.meta || {}, JSON.parse(entity.content))
                delete entity.content
                logger.trace('Json %s: %s', entity.collection, entity.id)
            }
        }
    })
}