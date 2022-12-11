
import path from 'path'
import { readFile } from 'fs/promises'

export default async ({ entity, options, config, context }) => {
    async function loadPlugin(pluginName) {   
        const resolveLocations = [
            path.join(options.workingFolder, 'node_modules', `mikser-render-${pluginName}.js`),
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
    const pluginsToLoad = [...context.plugins]
    if (entity.layout?.template) {
        pluginsToLoad.push(entity.layout.template)
    }
    if (entity.meta?.plugins) {
        pluginsToLoad.push(...entity.meta.plugins)
    }
    for (let pluginName of context.plugins || []) {
        const plugin = await loadPlugin(pluginName)
        plugins[pluginName] = plugin
        if (plugin.load) await plugin.load({ entity, options, config: config[pluginName], context })
    }

    let source
    for(let pluginName in plugins) {
        const plugin = plugins[pluginName]
        source = source || entity.layout.source || await readFile(entity.layout.uri, 'utf8')

        if (plugin.render) {
            const runtime = {
                [entity.type]: entity,
                entity,
                plugins,
                config: config[pluginName],
                data: context.data
            }
            source = await renderer.render({ entity, options, config, context, source, plugins, runtime })
        }
    }

    return source
}