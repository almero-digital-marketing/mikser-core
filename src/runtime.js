import pino from 'pino'
import path from 'node:path'
import { Command } from 'commander'
import { rm, lstat, realpath, mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import _ from 'lodash'
import Piscina from 'piscina'
import mikser from './mikser.js'
import { onInitialize, onInitialized, onRender, onCancel, onCancelled, onFinalized, onLoaded, onAfterRender } from './lifecycle.js'
import { useJournal, updateEntry } from './journal.js'
import { globby } from 'globby'
import { OPERATION } from './constants.js'
import render from './render.js'
import pMap from 'p-map'

export async function setup(options) {
    const { default: { version } } = await import('../package.json', { assert: { type: 'json' } })
    mikser.runtime = {
        logger: pino(options?.logger || {
            transport: {
                target: 'pino-pretty'
            },
        }),
        commander: new Command(),
        renderPool: new Piscina({
            filename: new URL('./render.js', import.meta.url).href,
            maxThreads: options?.threads !== undefined ? options.threads : 4
        })
    }
	mikser.state = {}
    
    onInitialize(async () => {
        mikser.runtime.commander?.version(version)
        .option('-i --working-folder <folder>', 'set mikser working folder', './')
        .option('-p --plugins [plugins...]', 'list of mikser plugins to load', [])
        .option('-c --config <file>', 'set mikser mikser.config.js location', './mikser.config.js')
        .option('-m --mode <mode>', 'set mikser runtime mode', 'development')
        .option('-r --clear', 'clear current state before execution', false)
        .option('-o --output-folder <folder>', 'set mikser output folder realtive to working folder ot absolute', 'out')
        .option('-w --watch', 'watch entities for changes', false)
        .option('-d --debug', 'display debug statements')
        .option('-t --trace', 'display trace statements')
        
        Object.assign(mikser.options, options || mikser.runtime.commander.parse(process.argv).opts())
        mikser.options.info = true
        if (mikser.options.debug) {
            mikser.runtime.logger.level = 'debug'
            mikser.options.info = false
        }
        if (mikser.options.trace) {
            mikser.runtime.logger.level = 'trace'
            mikser.options.debug = false
            mikser.options.info = false
        }
        mikser.runtime.logger.notice = mikser.runtime.logger.info
    })
    
    onInitialized(async () => {
        const logger = useLogger()
        
        mikser.options.workingFolder = path.resolve(mikser.options.workingFolder)
        process.chdir(mikser.options.workingFolder)

        mikser.options.runtimeFolder = path.join(mikser.options.workingFolder, mikser.options.runtimeFolder || 'runtime')
        mikser.options.outputFolder = path.join(mikser.options.workingFolder, mikser.options.outputFolder || 'out')
        
        logger.info('Working folder: %s', mikser.options.workingFolder)
        logger.info('Output folder: %s', mikser.options.outputFolder)
        
        if (mikser.options.clear) {
            try {
                logger.info('Clearing folders')
                await rm(mikser.options.outputFolder, { recursive: true })
                await rm(mikser.options.runtimeFolder, { recursive: true })
            } catch (err) {
                if (err.code != 'ENOENT')
                throw err
            }
        }
        await mkdir(mikser.options.runtimeFolder , { recursive: true })
    })

    onLoaded(async () => {
        const logger = useLogger()
        logger.debug(mikser.options, 'Mikser options')
    })
    
    onRender(async (signal) => {
        const logger = useLogger()
        const renderJobs = new Set()
        await pMap(useJournal('Rendering', [OPERATION.RENDER], signal), async entry => {
            const { id, entity, options, context } = entry
            const jobId = entity.id + ':' + entity.destination
            if (!renderJobs.has(jobId) && !options.ignore) {
                renderJobs.add(jobId)
                const renderOptions = { 
                    entity,
                    options: { ...mikser.options, ...options },
                    config: _.pickBy(mikser.config, (value, key) => _.startsWith(key, 'render-')),
                    context,
                    state: mikser.state
                }
                try {
                    if (options.immediate) {
                        renderOptions.logger = logger
                        if (options.abortable) {
                            renderOptions.signal = signal
                            if (!signal.aborted) {
                                const output = {
                                    result: await render(renderOptions),
                                    success: true
                                }
                                await updateEntry({ id, output })
                            }
                        } else {
                            const output = {
                                result: await render(renderOptions),
                                success: true
                            }
                            await updateEntry({ id, output })
                        }
                    } else {
                        const mc = new MessageChannel();
                        mc.port2.onmessage = event => {
                            const message = JSON.parse(event.data)
                            if (message.command == 'logger') {
                                mikser.runtime.logger[message.data.log](...message.data.args)
                            }
                        }
                        mc.port2.unref()
                        renderOptions.port = mc.port1
                        const output = {
                            result: await mikser.runtime.renderPool.run(
                                renderOptions, 
                                options.abortable === false ? { transferList: [mc.port1] } : { signal, transferList: [mc.port1] }
                            ),
                            success: true
                        }
                        await updateEntry({ id, output })
                    }
                    logger.debug('Rendered: [%s] %s → %s', options.renderer, entity.name || entity.id, entity.destination)
                } catch (err) {
                    if (err.name != 'AbortError') {
                        await updateEntry({ id, output: { success: false } })
                        logger.error('Render error: %s %s', entity.id, err.message)
                    }
                    logger.debug('Render canceled')
                }
            } else {
                await updateEntry({ id, output: { success: true } })
            }
        }, { 
            concurrency: options?.threads !== undefined ? options.threads : 4, 
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
        const renderOutput = path.join(mikser.options.runtimeFolder, `render-details.json`)
        await writeFile(renderOutput, JSON.stringify(Array.from(results.values())), 'utf8')
    })

    onCancel(async () => {
        if (mikser.runtime.renderPool.queueSize) {
            await new Promise(resolve => {
                mikser.runtime.renderPool.once('drain', resolve)
            })
        }
    })

    onFinalized(async () => {
        const logger = useLogger()

        const paths = await globby('**/*', { cwd: mikser.options.outputFolder })
        for (let relativePath of paths) {
            let source = path.join(mikser.options.outputFolder, relativePath)
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
        logger.notice('Mikser cancelled')
    })

    console.info('Mikser: %s', version)
    return mikser
}

export function useLogger() {
    return mikser.runtime.logger
}