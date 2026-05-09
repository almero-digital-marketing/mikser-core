import path from 'node:path'
import _ from 'lodash'

export async function loadPlugin(pluginName, workingFolder) {
    const resolveLocations = [
        path.join(workingFolder, 'node_modules', `mikser-core-${pluginName}/index.js`),
        path.join(workingFolder, 'plugins', `${pluginName}.js`),
        path.join(path.dirname(import.meta.url), 'plugins', 'post', `${pluginName.replace('post-', '')}.js`)
    ]
    for (let resolveLocation of resolveLocations) {
        try {
            return await import(resolveLocation)
        } catch (err) {
            if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
        }
    }
}

export default async ({ entity, options, config, context, state, logger }) => {

    const { postprocessor } = options
    const plugins = {}
    let pluginsToLoad = [...context.plugins || []]
    pluginsToLoad.push(`post-${postprocessor}`)
    if (entity.meta?.plugins) {
        pluginsToLoad.push(...entity.meta.plugins)
    }
    pluginsToLoad.push(...options.plugins)
    pluginsToLoad = _.uniq(pluginsToLoad.filter(pluginName => pluginName && pluginName.indexOf('post-') == 0))

    const runtime = {
        [entity.type]: entity,
        entity,
        plugins,
        config: config[`post-${postprocessor}`],
        data: context.data,
    }

    for (let pluginName of pluginsToLoad) {
        const plugin = await loadPlugin(pluginName, options.workingFolder)
        plugins[pluginName] = plugin
        if (plugin?.load) await plugin.load({ entity, options, config: config[pluginName], context, runtime, state, logger })
    }

    const postprocessorPlugin = plugins[`post-${postprocessor}`]
    return await postprocessorPlugin?.postprocess({ entity, options, config, context, plugins, runtime, state, logger })
}
