import { useLogger } from './runtime.js'
import { onLoad } from './lifecycle.js'
import mikser from './mikser.js'
import path from 'node:path'

import * as core from '../index.js'

export async function loadPlugin(pluginName) {
    const logger = useLogger()

    const resolveLocations = [
        path.join(path.dirname(import.meta.url), 'plugins', `${pluginName}.js`),
        path.join(mikser.options.workingFolder || '.', 'plugins', `${pluginName}.js`),
        path.join(mikser.options.workingFolder || '.', 'node_modules', `mikser-core-${pluginName}`,'index.js'),
    ]
    for (let index = 0; index < resolveLocations.length; index++) {
        const resolveLocation = resolveLocations[index]
        try {
            const plugin = await import(resolveLocation)
            const pluginRuntime = plugin.default(core)
            mikser.runtime[pluginName] = pluginRuntime
            if (pluginRuntime) {
                logger.trace('Loaded %s plugin: %s', pluginName, pluginRuntime)
            } else {
                logger.trace('Loaded %s plugin', pluginName)
            }
            return
        } catch (err) {
            logger.trace(err.message)
            if (index == 2) throw err
            if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
        }
    }
    for (let resolveLocations of resolveLocations) {
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