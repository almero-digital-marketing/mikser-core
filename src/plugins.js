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

export function userPlugins(filter) {
    const plugins = mikser.options.plugins.concat(mikser.config.plugins)
    if (!filter) return plugins
    return plugins.filter(plugin => plugin && filter(plugin))
}

onLoad(async () => {
    const logger = useLogger()

    const plugins = userPlugins(plugin => plugin.indexOf('render-') != 0)
    if (!plugins.length) {
        logger.info('No plugins loaded')
    } else {
        logger.info('Loading plugins: %s', plugins)

        for (let plugin of plugins) {
            await loadPlugin(plugin)
        }
    }
})