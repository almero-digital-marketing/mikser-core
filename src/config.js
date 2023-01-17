import mikser from './mikser.js'
import { useLogger } from './runtime.js'
import { onLoad } from './lifecycle.js'
import path from 'node:path'

onLoad(async () => {
    const logger = useLogger()
    const configFile = path.resolve(mikser.options.config)
    logger.info('Config: %s', configFile)
    try {
        const config = await import(configFile)
        if (typeof config.default == 'function') {
            mikser.config = await config.default(mikser)
        } else if (typeof config.default == 'object') {
            mikser.config = config.default
        }
    } catch (err) {
        if (err.code != 'ERR_MODULE_NOT_FOUND')
        throw err
    }

    const plugins = mikser.options.plugins.concat(mikser.config.plugins).filter(plugin => plugin)
    for (const plugin of plugins) {
        if (!mikser.config[plugin]) {
            try {
                const pluginConfig = path.join(mikser.options.workingFolder, 'config', `${plugin}.config.js`)
                const config = await import(pluginConfig)
                if (typeof config.default == 'function') {
                    mikser.config[plugin] = await config.default(mikser)
                } else if (typeof config.default == 'object') {
                    mikser.config[plugin] = config.default
                }
            } catch (err) {
                if (err.code != 'ERR_MODULE_NOT_FOUND')
                throw err
            }
        }
    }
})