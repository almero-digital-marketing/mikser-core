import pino from 'pino'
import path from 'node:path'
import { Command } from 'commander'
import { rmdir, lstat, realpath } from 'fs/promises'
import { existsSync } from 'fs'
import _ from 'lodash'
import Piscina from 'piscina'
import { AbortController } from 'abort-controller'
import { constants  } from './constants.js'
import mikser from './mikser.js'
import { onInitialize, onInitialized, onRender, onCancel, onFinalized } from './lifecycle.js'
import { globby } from 'globby'

export function useLogger() {
    return mikser.runtime.logger
}

export function useCommander() {
    return mikser.runtime.commander
}

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
            filename: new URL('./render.js', import.meta.url).href
        })
    }
	mikser.state = {}
    
    onInitialize(async () => {
        mikser.runtime.commander?.version(version)
        .option('--working-folder <folder>', 'set mikser working folder', './')
        .option('--plugins [plugins...]', 'list of mikser plugins to load', [])
        .option('--config <file>', 'set mikser mikser.config.js location', './mikser.config.js')
        .option('--mode <mode>', 'set mikser runtime mode', 'development')
        .option('--clear', 'clear current state before execution', false)
        .option('-o --output <folder>', 'set mikser output folder realtive to working folder ot absolute', 'out')
        .option('-w --watch', 'watch entities for changes', false)
        .option('-d --debug', 'display debug statements')
        .option('-t --trace', 'display trace statements')
    })
    
    onInitialized(async () => {
        const logger = useLogger()
        const commander = useCommander()
        
        Object.assign(mikser.options, options || commander.parse(process.argv).opts())
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
        
        logger.debug(mikser.options, 'Mikser options')
        logger.info('Working folder: %s', mikser.options.workingFolder)
        logger.info('Output folder: %s', mikser.options.outputFolder)
        
        if (mikser.options.clear) {
            try {
                logger.info('Clearing folders')
                await rmdir(mikser.options.outputFolder, { recursive: true })
                await rmdir(mikser.options.runtimeFolder, { recursive: true })
            } catch (err) {
                if (err.code != 'ENOENT')
                throw err
            }
        }
    })
    
    let abortController
    onRender(async () => {
        const logger = useLogger()
        const entitiesToRender = useOperations(['render'])
        logger.info('Render jobs: %d', entitiesToRender.length)
        abortController = new AbortController()
        const { signal } = abortController
        await Promise.all(entitiesToRender.map(async operation => {
            const { entity, renderer, context } = operation
            try {
                operation.result = await render(entity, renderer, context, signal)
            } catch (err) {
                if (err.name != 'AbortError') {
                    logger.error('Render error: %s %s', entity.id, err.message)
                }
                logger.trace('Render canceled')    
            } 
        }))
    })

    onCancel(async () => {
        abortController?.abort()
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
        logger.info('Mikser completed')
    })
       
    console.info('Mikser: %s', version)
    return mikser
}

export function useOperations(operations) {
    return mikser.operations
    .filter(({ operation }) => operations.indexOf(operation) != -1)
}

export async function createEntity(entity) {
    const logger = useLogger()
    entity.stamp = mikser.stamp
    entity.time = Date.now()
    logger.debug('Create %s entity: %s', entity.collection, entity.id)
    mikser.operations.push({ operation: constants.OPERATION_CREATE, entity })
}

export async function deleteEntity({ id, collection, type }) {
    const logger = useLogger()
    logger.debug('Delete %s entity: %s %s', collection, type, id)
    mikser.operations.push({ operation: constants.OPERATION_DELETE, entity: { id, type, collection } })
}

export async function updateEntity(entity) {
    const logger = useLogger()
    entity.stamp = mikser.stamp
    entity.time = Date.now()
    logger.debug('Update %s entity: %s', entity.collection, entity.id)
    mikser.operations.push({ operation: constants.OPERATION_UPDATE, entity })
}

export async function renderEntity(entity, renderer, context = {}) {
    const logger = useLogger()
    logger.debug('Render %s entity: [%s] %s → %s', entity.collection, renderer, entity.id, entity.destination)
    mikser.operations.push({ operation: constants.OPERATION_RENDER, entity, renderer, context })
}

export async function render(entity, renderer, context, signal) {
    const logger = useLogger()
    const result = await mikser.runtime.renderPool.run({ 
        entity,
        renderer,
        options: mikser.options,
        config: _.pickBy(mikser.config, (value, key) => _.startsWith(key, 'render-')),
        context,
        state: mikser.state
    }, { signal })
    logger.info('Rendered %s: [%s] %s', entity.type, renderer, entity.destination)
    return result
}
