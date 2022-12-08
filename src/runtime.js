import pino from 'pino'
import path from 'path'
import { Command } from 'commander'
import { mikser, onInitialize, onInitialized, onRender, onCancel } from './index.js'
import { rmdir } from 'fs/promises'
import _ from 'lodash'
import Piscina from 'piscina'
import { AbortController } from 'abort-controller'

import './config.js'
import './plugins.js'

export function useLogger() {
    return mikser.runtime.logger
}

export function useCommander() {
    return mikser.runtime.commander
}

export async function createMikser(options) {
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
    
    onInitialize(async () => {
        mikser.runtime.commander?.version(version)
        .option('--working-folder <folder>', 'set mikser working folder', path.dirname(process.argv[1]))
        .option('--plugins [plugins...]', 'list of mikser plugins to load', [])
        .option('--clear', 'clear everything before generation', [])
        .option('-o --output <folder>', 'set mikser output folder realtive to working folder ot absolute', 'out')
        .option('-w --watch [types]', 'watch entity types for changes', [])
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
        mikser.options.runtimeFolder = path.join(mikser.options.workingFolder, 'runtime')
        mikser.options.outputFolder = path.isAbsolute(mikser.options.output) ? mikser.options.output : path.join(mikser.options.workingFolder, mikser.options.output)
        
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
            try {
                const { entity, context } = operation
                operation.result = await render(entity, context, signal)
            } catch (err) {
                if (err.name != 'AbortError') {
                    logger.error(err, 'Render error')
                    throw err
                }
                logger.trace('Render canceled:', entity.id)    
            } 
        }))
    })

    onCancel(async () => {
        abortController?.abort()
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
    logger.debug('Create %s entity: %s', entity.collection, entity.id)
    mikser.operations.push({ operation: 'create', entity })
}

export async function deleteEntity({ id, type }) {
    const logger = useLogger()
    logger.debug('Delete %s entity: %s', collection, id)
    mikser.operations.push({ operation: 'delete', entity: { id, type } })
}

export async function updateEntity(entity) {
    const logger = useLogger()
    entity.stamp = mikser.stamp
    logger.debug('Update %s entity: %s', entity.collection, entity.id)
    mikser.operations.push({ operation: 'update', entity })
}

export async function renderEntity(entity, context) {
    const logger = useLogger()
    logger.info('Render %s entity: %s → %s', entity.collection, entity.id, entity.destination)
    mikser.operations.push({ operation: 'render', entity, context })
}

export async function render(entity, context, signal) {
    return await mikser.runtime.renderPool.run({ 
        entity,
        options: mikser.options,
        config: _.pickBy(mikser.config, (value, key) => _.startsWith(key, 'render')),
        context
    }, { signal })
}

export function detectFeatures(features) {
    const available = Object.keys(mikser)
    const missing = []
    for(let feature of features) {
        if (!available.indexOf(feature)) {
            missing.push(feature)
        }
    }
    const logger = useLogger()
    if (missing.length) {
        logger.error('Missing features: %s', missing)
    }
    return !missing.length
}