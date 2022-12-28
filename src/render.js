
import { readFileSync } from 'fs'
import path from 'path'

export default async ({ entity, renderer, options, config, context }) => {
    async function loadPlugin(pluginName) {   
        const resolveLocations = [
            path.join(options.workingFolder, 'node_modules', `mikser-core-${pluginName}/index.js`),
            path.join(options.workingFolder, 'plugins', `${pluginName}.js`),
            path.join(path.dirname(import.meta.url), 'plugins', 'render', `${pluginName.replace('render-','')}.js`)
        ]
        for (let resolveLocation of resolveLocations) {
            try {
                return await import(resolveLocation)
            } catch (err) {
                if (err.code != 'ERR_MODULE_NOT_FOUND') {
                    console.error('Redner plugin error:', resolveLocation, err)
                    throw err
                }
            }
        }
    }

    const plugins = {}
    let pluginsToLoad = [...context.plugins || []]
    pluginsToLoad.push(`render-${renderer}`)
    if (entity.meta?.plugins) {
        pluginsToLoad.push(...entity.meta.plugins)
    }
    options?.plugins && pluginsToLoad.push(...options.plugins)
    config?.plugins && pluginsToLoad.push(...config.plugins)

    pluginsToLoad = pluginsToLoad.filter(pluginName => pluginName && pluginName.indexOf('render-') == 0)
    
    const runtime = {
        [entity.type]: entity,
        entity,
        plugins,
        config: config[renderer],
        data: context.data,
        content() {
            return readFileSync(entity.source, { encoding: 'utf8' })
        }
    }
    
    for (let pluginName of pluginsToLoad) {
        const plugin = await loadPlugin(pluginName)
        plugins[pluginName] = plugin
        if (plugin?.load) await plugin.load({ entity, options, config: config[pluginName], context, runtime })
    }
    
    const rendererPlugin = plugins[`render-${renderer}`]
    return await rendererPlugin?.render({ entity, options, config, context, plugins, runtime })
}