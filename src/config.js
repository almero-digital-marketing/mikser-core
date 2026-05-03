import runtime from './runtime.js'
import { useLogger } from './engine.js'
import { onLoad } from './lifecycle.js'
import path from 'node:path'

onLoad(async () => {
	const logger = useLogger()
	const configFile = path.resolve(runtime.options.config)
	logger.info('Config: %s', configFile)
	try {
		const config = await import(configFile)
		if (typeof config.default == 'function') {
			runtime.config = await config.default(runtime)
		} else if (typeof config.default == 'object') {
			runtime.config = config.default
		}
	} catch (err) {
		if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
	}

	const plugins = runtime.options.plugins.concat(runtime.config.plugins).filter((plugin) => plugin)
	for (const plugin of plugins) {
		if (!runtime.config[plugin]) {
			try {
				const pluginConfig = path.join(runtime.options.workingFolder, 'config', `${plugin}.config.js`)
				const config = await import(pluginConfig)
				if (typeof config.default == 'function') {
					runtime.config[plugin] = await config.default(runtime)
				} else if (typeof config.default == 'object') {
					runtime.config[plugin] = config.default
				}
			} catch (err) {
				if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
			}
		}
	}
})
