import { useLogger } from './mikser.js'
import { onLoad } from './lifecycle.js'
import runtime from './runtime.js'
import path from 'node:path'
import fs from 'fs'

import * as core from '../index.js'

export async function loadPlugin(pluginName) {
    const logger = useLogger()

    const resolveLocations = [
        path.join(path.dirname(import.meta.url), 'plugins', `${pluginName}.js`),
        path.join(runtime.options.workingFolder, 'plugins', `${pluginName}.js`),
        path.join(runtime.options.workingFolder, 'node_modules', `mikser-core-${pluginName}`,'index.js'),
    ]
    for (let index = 0; index < resolveLocations.length; index++) {
        const resolveLocation = resolveLocations[index]
        if (fs.existsSync(resolveLocation.replace('file:',''))) {
            try {
                const plugin = await import(resolveLocation)
                const pluginRuntime = plugin.default(core)
                runtime.mikser[pluginName] = pluginRuntime
                if (pluginRuntime) {
                    logger.trace('Loaded %s plugin: %s', pluginName, pluginRuntime)
                } else {
                    logger.trace('Loaded %s plugin', pluginName)
                }
                return
            } catch (err) {
                logger.error('Plugin load error: [%s] %s', pluginName, err.message)
                return
            }
        }
    }
    logger.error('Plugin not loaded: %s', pluginName)
}

onLoad(async () => {
    const logger = useLogger()

    runtime.options.plugins = runtime.options.plugins.concat(runtime.config.plugins).filter(plugin => plugin)

    const userPlugins =  runtime.options.plugins.filter(plugin => plugin.indexOf('render-') != 0)
    if (!userPlugins.length) {
        logger.info('No plugins loaded')
    } else {
        logger.info('Loading plugins: %s', userPlugins)

        for (let plugin of userPlugins) {
            await loadPlugin(plugin)
        }
    }
})