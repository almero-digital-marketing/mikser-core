import { mikser, onLoad, useLogger } from './index.js'
import path from 'node:path'

onLoad(async () => {
    const logger = useLogger()
    const configFile = path.join(mikser.options.workingFolder || '.', 'mikser.config.js')
    try {
        const config = await import(configFile)
        logger.debug('Config: %s', configFile)
        if (typeof config.default == 'function') {
            mikser.config = await config.default(mikser)
        } else if (typeof config.default == 'object') {
            mikser.config = config.default
        }
    } catch (err) {
        if (err.code != 'ERR_MODULE_NOT_FOUND')
        throw err
    }
})