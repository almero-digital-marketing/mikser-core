import { useLogger } from './engine.js'
import { onLoad } from './lifecycle.js'
import runtime from './runtime.js'
import path from 'node:path'
import fs from 'fs'
import { createRequire } from 'node:module'

import * as core from '../index.js'

export async function loadPlugin(pluginName) {
    const logger = useLogger()

    const require = createRequire(path.join(runtime.options.workingFolder, 'package.json'))
    let nodeModulesResolved
    try {
        nodeModulesResolved = require.resolve(`mikser-io-${pluginName}`)
    } catch { }

    const resolveLocations = [
        path.join(path.dirname(import.meta.url), 'plugins', `${pluginName}.js`),
        path.join(runtime.options.workingFolder, 'plugins', `${pluginName}.js`),
        path.join(runtime.options.workingFolder, 'node_modules', `mikser-io-${pluginName}`, 'index.js'),
        nodeModulesResolved,
    ].filter(Boolean)
    for (let index = 0; index < resolveLocations.length; index++) {
        const resolveLocation = resolveLocations[index]
        if (fs.existsSync(resolveLocation.replace('file:', ''))) {
            try {
                const plugin = await import(resolveLocation)
                const pluginRuntime = plugin.default(core)
                runtime.engine[pluginName] = pluginRuntime
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

    const userPlugins = runtime.options.plugins.filter(plugin => plugin.indexOf('render-') != 0 && plugin.indexOf('post-') != 0)
    if (!userPlugins.length) {
        logger.info('No plugins loaded')
    } else {
        logger.info('Loading plugins: %s', userPlugins)

        for (let plugin of userPlugins) {
            await loadPlugin(plugin)
        }
    }
})