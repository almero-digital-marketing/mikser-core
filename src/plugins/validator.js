import _ from 'lodash'

export default ({ 
    onLoad, 
    onValidate,
    mikser,
    matchEntity,
    constants: { OPERATION }, 
}) => {
    onLoad(() => {    
        for (let { match, validate, operations = [OPERATION.CREATE, OPERATION.UPDATE] } of mikser.config.validator?.validators || []) {               
            onValidate(operations, async entry => {
                if (entity.meta && matchEntity(entry.entity, match)) {
                    return await validate(entry.entity)
                }
            })
        }
    })
}