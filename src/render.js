
import path from 'path'

export default async ({ entity, options, config, context }) => {
    async function loadPlugin(pluginName) {   
        const resolveLocations = [
            path.join(options.workingFolder, 'node_modules', `mikser-core-render-${pluginName}/index.js`),
            path.join(options.workingFolder, 'plugins', 'render', `${pluginName}.js`),
            path.join(path.dirname(import.meta.url), 'plugins', 'render', `${pluginName}.js`)
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
    const pluginsToLoad = [...context.plugins || []]
    if (entity.layout?.template) {
        pluginsToLoad.push(entity.layout.template)
    }
    if (entity.meta?.plugins) {
        pluginsToLoad.push(...entity.meta.plugins)
    }
    for (let pluginName of pluginsToLoad) {
        const plugin = await loadPlugin(pluginName)
        plugins[pluginName] = plugin
        if (plugin?.load) await plugin.load({ entity, options, config: config[pluginName], context })
    }

    const runtime = {
        [entity.type]: entity,
        entity,
        plugins,
        config: config[entity.layout.template],
        data: context.data,
    }
    const renderer = plugins[entity.layout.template]
    return await renderer.render({ entity, options, config, context, plugins, runtime })
}