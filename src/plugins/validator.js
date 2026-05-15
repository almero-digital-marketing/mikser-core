import _ from 'lodash'

export default ({
    onLoad,
    onValidate,
    runtime,
    matchEntity,
    constants: { OPERATION },
}) => {
    onLoad(() => {
        for (let { match, validate, operations = [OPERATION.CREATE, OPERATION.UPDATE] } of runtime.config.validator?.validators || []) {
            onValidate(operations, async entry => {
                if (entry.entity?.meta && matchEntity(entry.entity, match)) {
                    return await validate(entry.entity)
                }
            })
        }
    })
}