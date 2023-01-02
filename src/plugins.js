import { mikser, onLoad, useLogger } from './index.js'
import path from 'node:path'

export async function loadPlugin(pluginName) {
    const logger = useLogger()

    const resolveLocations = [
        path.join(mikser.options.workingFolder || '.', 'node_modules', `mikser-core-${pluginName}`,'index.js'),
        path.join(mikser.options.workingFolder || '.', 'plugins', `${pluginName}.js`),
        path.join(path.dirname(import.meta.url), 'plugins', `${pluginName}.js`)
    ]
    for (let resolveLocation of resolveLocations) {
        try {
            const plugin = await import(resolveLocation)
            const pluginRuntime = Object.keys(plugin)
            if (pluginRuntime.length) {
                mikser.runtime[pluginName] = plugin
                logger.trace('Loaded %s plugin: %s', pluginName, pluginRuntime)
            } else {
                logger.trace('Loaded %s plugin', pluginName)
            }
            return
        } catch (err) {
            if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
        }
    }
    logger.error('Plugin not found: %s', pluginName)
}

onLoad(async () => {
    const logger = useLogger()

    mikser.state.plugins = mikser.options.plugins.concat(mikser.config.plugins).filter(plugin => plugin)

    const userPlugins =  mikser.state.plugins.filter(plugin => plugin.indexOf('render-') != 0)
    if (!userPlugins.length) {
        logger.info('No plugins loaded')
    } else {
        logger.info('Loading plugins: %s', userPlugins)

        for (let plugin of userPlugins) {
            await loadPlugin(plugin)
        }
    }
})