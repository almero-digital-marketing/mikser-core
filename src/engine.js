import pino from 'pino'
import path from 'node:path'
import { Command } from 'commander'
import { rm, lstat, realpath, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import _ from 'lodash'
import Piscina from 'piscina'
import runtime from './runtime.js'
import { onInitialize, onInitialized, onRender, onCancel, onCancelled, onFinalized, onLoaded, onAfterRender, onBeforePostprocess, onPostprocess, postprocessEntities } from './lifecycle.js'
import { useJournal, updateEntry } from './journal.js'
import { globby } from 'globby'
import { OPERATION, TASKS } from './constants.js'
import { changeExtension } from './utils.js'
import render from './render.js'
import postprocess, { loadPlugin as loadPostPlugin } from './postprocess.js'
import map from 'p-map'
import Queue from 'p-queue'
import packageInfo from '../package.json' with { type: 'json' }

export async function setup(options) {
    runtime.options.threads = options?.threads !== undefined ? options.threads : 4
    runtime.engine = {
        logger: pino(options?.logger || {
            transport: {
                target: 'pino-pretty'
            },
        }),
        commander: new Command(),
        renderWorkers: new Piscina({
            filename: new URL('./render.js', import.meta.url).href,
            maxThreads: runtime.options.threads
        }),
        queue: new Queue({ concurrency: 1 })
    }
    runtime.state = {}

    onInitialize(async () => {
        runtime.engine.commander?.version(packageInfo.version)
            .option('-i --working-folder <folder>', 'set mikser working folder', './')
            .option('-p --plugins [plugins...]', 'list of mikser plugins to load', [])
            .option('-c --config <file>', 'set mikser mikser.config.js location', './mikser.config.js')
            .option('-m --mode <mode>', 'set mikser runtime mode', 'development')
            .option('-r --clear', 'clear current state before execution', false)
            .option('-o --output-folder <folder>', 'set mikser output folder relative to working folder', 'out')
            .option('-w --watch', 'watch entities for changes', false)
            .option('-d --debug', 'display debug statements')
            .option('-t --trace', 'display trace statements')
            .option('-e --runtime-folder <folder>', 'set mikser runtime folder relative to working folder', 'runtime')

        Object.assign(runtime.options, options || runtime.engine.commander.parse(process.argv).opts())
        runtime.options.info = true
        if (runtime.options.debug) {
            runtime.engine.logger.level = 'debug'
            runtime.options.info = false
        }
        if (runtime.options.trace) {
            runtime.engine.logger.level = 'trace'
            runtime.options.debug = false
            runtime.options.info = false
        }
        runtime.engine.logger.notice = runtime.engine.logger.info
    })

    onInitialized(async () => {
        const logger = useLogger()

        runtime.options.workingFolder = path.resolve(runtime.options.workingFolder)
        process.chdir(runtime.options.workingFolder)

        runtime.options.runtimeFolder = path.join(runtime.options.workingFolder, runtime.options.runtimeFolder || 'runtime')
        runtime.options.outputFolder = path.join(runtime.options.workingFolder, runtime.options.outputFolder || 'out')

        logger.info('Working folder: %s', runtime.options.workingFolder)
        logger.info('Output folder: %s', runtime.options.outputFolder)

        if (runtime.options.clear) {
            try {
                logger.info('Clearing folders')
                await rm(runtime.options.outputFolder, { recursive: true })
                await rm(runtime.options.runtimeFolder, { recursive: true })
            } catch (err) {
                if (err.code != 'ENOENT')
                    throw err
            }
        }
        await mkdir(runtime.options.runtimeFolder, { recursive: true })
    })

    onLoaded(async () => {
        const logger = useLogger()
        logger.debug(runtime.options, 'Mikser options')
    })

    onRender(async (signal) => {
        const logger = useLogger()
        const renderJobs = new Set()
        await map(useJournal('Rendering', [OPERATION.RENDER], signal), async entry => {
            const { id, entity, options, context } = entry
            const jobId = entity.id + ':' + entity.destination
            if (!renderJobs.has(jobId) && !options.ignore) {
                renderJobs.add(jobId)
                const renderOptions = {
                    entity,
                    options: {
                        tasks: TASKS.POOL,
                        ...runtime.options,
                        ...options,
                    },
                    config: _.pickBy(runtime.config, (value, key) => _.startsWith(key, 'render-')),
                    context,
                    state: runtime.state
                }
                try {
                    let result
                    switch (renderOptions.options.tasks) {
                        case TASKS.POOL:
                            renderOptions.logger = logger
                            renderOptions.signal = signal
                            if (!signal.aborted) {
                                result = await render(renderOptions)
                            }
                            break
                        case TASKS.QUEUE:
                            renderOptions.logger = logger
                            renderOptions.signal = signal
                            if (!signal.aborted) {
                                result = await runtime.engine.queue.add(() => render(renderOptions), { signal })
                            }
                            break
                        case TASKS.WORKER:
                            const mc = new MessageChannel();
                            mc.port2.onmessage = event => {
                                const message = JSON.parse(event.data)
                                if (message.command == 'logger') {
                                    runtime.engine.logger[message.data.log](...message.data.args)
                                }
                            }
                            mc.port2.unref()
                            renderOptions.port = mc.port1
                            result = await runtime.engine.renderWorkers.run(
                                renderOptions,
                                { signal, transferList: [mc.port1] }
                            )
                            break
                    }
                    if (!signal.aborted) {
                        entry.output = {
                            success: true,
                            result,
                        }
                        if (!options.postprocessor) {
                            await runtime.complete(entry)
                        }
                        await updateEntry({ id, output: entry.output })
                    }

                    logger.debug('Rendered: [%s] %s → %s', options.renderer, entity.name || entity.id, entity.destination)
                } catch (err) {
                    if (!signal.aborted) {
                        await updateEntry({ id, output: { success: false } })
                        logger.error('Render error: %s %s', entity.id, err.message)
                    }
                    logger.debug('Render canceled')
                }
            } else {
                await updateEntry({ id, output: { success: true } })
            }
        }, {
            concurrency: runtime.options.threads,
            signal
        })
        renderJobs.size && logger.info('Rendered: %d', renderJobs.size)
    })

    onAfterRender(async () => {
        const results = new Map()
        for await (let { output, entity } of useJournal('Output', [OPERATION.RENDER])) {
            if (output?.success) {
                const jobId = entity.id + ':' + entity.destination
                results.set(jobId, entity)
            }
        }
        const renderOutput = path.join(runtime.options.runtimeFolder, `render-details.json`)
        await writeFile(renderOutput, JSON.stringify(Array.from(results.values())), 'utf8')
    })

    onBeforePostprocess(async (signal) => {
        const tasks = []
        for await (const { entity, options, context, output } of useJournal('Queuing postprocess', [OPERATION.RENDER], signal)) {
            if (output?.success && options.postprocessor) {
                tasks.push({
                    entity: {
                        ...entity,
                        origin: entity.destination,
                        destination: changeExtension(entity.destination, options.postprocessor)
                    },
                    options: { postprocessor: options.postprocessor, tasks: options.tasks },
                    context
                })
            }
        }
        if (tasks.length) await postprocessEntities(tasks)
    })

    onPostprocess(async (signal) => {
        const logger = useLogger()
        const config = _.pickBy(runtime.config, (value, key) => _.startsWith(key, 'post-'))

        const postPlugins = {}
        for (const pluginName of runtime.options.plugins.filter(p => p.startsWith('post-'))) {
            const plugin = await loadPostPlugin(pluginName, runtime.options.workingFolder)
            if (plugin) {
                postPlugins[pluginName] = plugin
                if (plugin.setup) await plugin.setup({ options: runtime.options, config: config[pluginName], state: runtime.state, logger })
            }
        }

        const postprocessJobs = new Set()
        try {
        await map(useJournal('Postprocessing', [OPERATION.POSTPROCESS], signal), async entry => {
            const { id, entity, options, context } = entry
            const jobId = entity.id + ':' + entity.destination
            if (!postprocessJobs.has(jobId) && !options.ignore) {
                postprocessJobs.add(jobId)
                const postprocessOptions = {
                    entity,
                    options: {
                        tasks: TASKS.POOL,
                        ...runtime.options,
                        ...options,
                    },
                    config,
                    context,
                    state: runtime.state
                }
                try {
                    let result
                    switch (postprocessOptions.options.tasks) {
                        case TASKS.POOL:
                            postprocessOptions.logger = logger
                            postprocessOptions.signal = signal
                            if (!signal.aborted) {
                                result = await postprocess(postprocessOptions)
                            }
                            break
                        case TASKS.QUEUE:
                            postprocessOptions.logger = logger
                            postprocessOptions.signal = signal
                            if (!signal.aborted) {
                                result = await runtime.engine.queue.add(() => postprocess(postprocessOptions), { signal })
                            }
                            break
                    }
                    if (!signal.aborted) {
                        entry.output = { success: true }
                        if (result) entry.output.result = result
                        await runtime.complete(entry)
                        await updateEntry({ id, output: entry.output })
                    }
                    logger.debug('Postprocessed: [%s] %s → %s', options.postprocessor, entity.name || entity.id, entity.destination)
                } catch (err) {
                    if (!signal.aborted) {
                        await updateEntry({ id, output: { success: false } })
                        logger.error('Postprocess error: %s %s', entity.id, err.message)
                    }
                    logger.debug('Postprocess canceled')
                }
            } else {
                await updateEntry({ id, output: { success: true } })
            }
        }, {
            concurrency: runtime.options.threads,
            signal
        })
        postprocessJobs.size && logger.info('Postprocessed: %d', postprocessJobs.size)
        } finally {
            for (const [pluginName, plugin] of Object.entries(postPlugins)) {
                if (plugin.teardown) await plugin.teardown({ options: runtime.options, config: config[pluginName], state: runtime.state, logger })
            }
        }
    })

    onCancel(async () => {
        if (runtime.engine.renderWorkers.queueSize) {
            await new Promise(resolve => {
                runtime.engine.renderWorkers.once('drain', resolve)
            })
        }
    })

    onFinalized(async () => {
        const logger = useLogger()

        const paths = await globby('**/*', { cwd: runtime.options.outputFolder, followSymbolicLinks: false })
        for (let relativePath of paths) {
            let source = path.join(runtime.options.outputFolder, relativePath)
            const linkStat = await lstat(source)
            if (linkStat.isSymbolicLink()) {
                const destination = await realpath(source)
                if (!existsSync(destination)) {
                    await unlink(source)
                }
            }
        }
        logger.notice('Mikser completed')
    })

    onCancelled(async () => {
        const logger = useLogger()
        logger.notice('Mikser restarted')
    })

    console.info('Mikser: %s', packageInfo.version)
    return runtime
}

export function useLogger() {
    return runtime.engine.logger
}
