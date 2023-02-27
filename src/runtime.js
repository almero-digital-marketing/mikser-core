import pino from 'pino'
import path from 'node:path'
import { Command } from 'commander'
import { rm, lstat, realpath, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import _ from 'lodash'
import Piscina from 'piscina'
import mikser from './mikser.js'
import { onInitialize, onInitialized, onRender, onCancelled, onFinalized, useJournal, clearJournal, onLoaded } from './lifecycle.js'
import { globby } from 'globby'
import { OPERATION } from './constants.js'
import render from './render.js'

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
    })
    
    onInitialized(async () => {
        const logger = useLogger()
        
        Object.assign(mikser.options, options || mikser.runtime.commander.parse(process.argv).opts())
        if (mikser.options.debug) {
            logger.level = 'debug'
        }
        if (mikser.options.trace) {
            logger.level = 'trace'
        }
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
        let pending = 0
        let interval = setInterval(() => {
            logger.info('Pending renders: %d', pending)
        }, 1000)
        const renderJobs = new Map()
        for (let entry of useJournal(OPERATION.RENDER)) {
            const { entity, options, context } = entry
            const jobId = entity.id + ':' + entity.destination
            if (!renderJobs.has(jobId) && !options.ignore) {
                pending++
                renderJobs.set(jobId, async () => {
                    const renderOptions = { 
                        entity,
                        options: { ...mikser.options, ...options },
                        config: _.pickBy(mikser.config, (value, key) => _.startsWith(key, 'render-')),
                        context,
                        state: mikser.state,
                        niceIncrement: 10
                    }
                    try {
                        if (options.immediate) {
                            if (options.abortable) {
                                renderOptions.signal = signal
                                if (!signal.aborted) {
                                    entry.output = await render(renderOptions)
                                    entry.success = true
                                }
                            } else {
                                entry.output = await render(renderOptions)
                                entry.success = true
                            }
                        } else {
                            entry.output = await mikser.runtime.renderPool.run(renderOptions, options.abortable === false ? {} : { signal })
                            entry.success = true
                        }
                        logger.debug('Rendered: [%s] %s → %s', options.renderer, entity.name || entity.id, entity.destination)
                    } catch (err) {
                        if (err.name != 'AbortError') {
                            logger.error('Render error: %s %s', entity.id, err.message)
                        }
                        logger.debug('Render canceled')
                    }
                    pending-- 
                })
            }
        }
        await Promise.all(Array.from(renderJobs.values()).map(renderJob => renderJob()))
        clearInterval(interval)
        if (pending > 0) {
            logger.warn('Unfinished renders: %d', pending)
        }
    })

    onCancelled(async () => {
        if (mikser.runtime.renderPool.queueSize) {
            return new Promise(resolve => {
                mikser.runtime.renderPool.once('drain', resolve)
            })
        }
    })

    onFinalized(async (signal) => {
        const logger = useLogger()
        
        clearJournal(signal.aborted)

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
        logger.info('Mikser completed')
    })
       
    console.info('Mikser: %s', version)
    return mikser
}

export function useLogger() {
    return mikser.runtime.logger
}