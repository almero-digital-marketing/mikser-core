
import path from 'path'

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

    const renderer = await loadPlugin(entity.layout.template)
    if (renderer) {
        const plugins = {}
        for (let pluginName of context.plugins || []) {
            context.plugins[pluginName] = await loadPlugin(pluginName)
        }
        context.plugins = plugins
        return renderer.render({ entity, options, config, context })
    }
}