import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import _ from 'lodash'
import { useLogger } from './engine.js'

// Flatten template-helper args into a single human-readable message.
// Handlebars helpers receive a trailing options object (it has a `.hash`
// property) which we drop.
function formatLogArgs(args) {
    if (args.length && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null && 'hash' in args[args.length - 1]) {
        args = args.slice(0, -1)
    }
    return args
        .map(arg => {
            if (arg == null) return String(arg)
            if (typeof arg === 'object') {
                try { return JSON.stringify(arg) } catch { return String(arg) }
            }
            return String(arg)
        })
        .join(' ')
}

export default async ({ entity, options, config, context, state, logger, port }) => {
    logger = logger || {
        info(...args) {
            port.postMessage(JSON.stringify({ command: 'logger', data: { log: 'info', args } }))
        },
        warn(...args) {
            port.postMessage(JSON.stringify({ command: 'logger', data: { log: 'warn', args } }))
        },
        error(...args) {
            port.postMessage(JSON.stringify({ command: 'logger', data: { log: 'error', args } }))
        },
        trace(...args) {
            port.postMessage(JSON.stringify({ command: 'logger', data: { log: 'trace', args } }))
        },
        notice(...args) {
            port.postMessage(JSON.stringify({ command: 'logger', data: { log: 'notice', args } }))
        }
    }

    async function loadPlugin(pluginName) {
        const require = createRequire(path.join(options.workingFolder, 'package.json'))
        let nodeModulesResolved
        try {
            nodeModulesResolved = require.resolve(`mikser-io-${pluginName}`)
        } catch { /* package not installed at this level — fine, try next */ }

        const resolveLocations = [
            path.join(options.workingFolder, 'node_modules', `mikser-io-${pluginName}/index.js`),
            nodeModulesResolved,
            path.join(options.workingFolder, 'plugins', `${pluginName}.js`),
            path.join(path.dirname(import.meta.url), 'plugins', 'render', `${pluginName.replace('render-', '')}.js`)
        ].filter(Boolean)

        for (let resolveLocation of resolveLocations) {
            // Existence-check first: once we know the plugin file is there,
            // any subsequent ERR_MODULE_NOT_FOUND is a *transitive* dep
            // missing (e.g. plugin imports a package that isn't installed),
            // not a "this plugin isn't here, try the next path" signal.
            if (!existsSync(resolveLocation.replace(/^file:/, ''))) continue
            try {
                return await import(resolveLocation)
            } catch (err) {
                if (err.code === 'ERR_MODULE_NOT_FOUND') {
                    logger.error('Render plugin %s found at %s but its dependencies are missing: %s', pluginName, resolveLocation, err.message)
                } else {
                    logger.error('Render plugin %s failed to load (%s): %s', pluginName, resolveLocation, err.message)
                }
                throw err
            }
        }

        logger.error('Render plugin %s not found.', pluginName)
    }

    const { renderer } = options
    const plugins = {}
    let pluginsToLoad = [...context.plugins || []]
    pluginsToLoad.push(`render-${renderer}`)
    if (entity.meta?.plugins) {
        pluginsToLoad.push(...entity.meta.plugins)
    }
    pluginsToLoad.push(...options.plugins)
    pluginsToLoad = _.uniq(pluginsToLoad.filter(pluginName => pluginName && pluginName.indexOf('render-') == 0))

    const runtime = {
        [entity.type]: entity,
        entity,
        plugins,
        config: config[`render-${renderer}`],
        data: context.data,
        content() {
            return readFileSync(entity.source, { encoding: 'utf8' })
        },
        // Logger functions are exposed directly so each renderer's
        // auto-helper loop picks them up are picked up; falls back to the local `logger` in
        // worker contexts where the engine singleton isn't initialised.
        //
        // Args are flattened into a single space-separated message so
        // every value the template passed shows up — pino otherwise drops
        // trailing positional args unless the first contains %s/%d format
        // specifiers. Handlebars appends an internal options object as
        // the last arg, which we strip before joining.
        log: (...args) => (useLogger() ?? logger).info(formatLogArgs(args)),
        warn: (...args) => (useLogger() ?? logger).warn(formatLogArgs(args)),
        error: (...args) => (useLogger() ?? logger).error(formatLogArgs(args)),
        debug: (...args) => (useLogger() ?? logger).debug(formatLogArgs(args)),
        trace: (...args) => (useLogger() ?? logger).trace(formatLogArgs(args)),
    }

    for (let pluginName of pluginsToLoad) {
        const plugin = await loadPlugin(pluginName)
        plugins[pluginName] = plugin
        if (plugin?.load) await plugin.load({ entity, options, config: config[pluginName], context, runtime, state, logger })
    }

    const rendererPlugin = plugins[`render-${renderer}`]
    return await rendererPlugin?.render({ entity, options, config, context, plugins, runtime, state, logger })
}