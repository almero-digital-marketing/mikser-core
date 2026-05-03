import runtime from './runtime.js'
import chokidar from 'chokidar'
import cron from 'node-cron'
import { onProcess, onFinalized } from './lifecycle.js'
import { useLogger } from './engine.js'
import { ACTION } from './constants.js'

const tasks = []

export async function createdHook(name, context) {
    if (!runtime.started) return

    const synced = await runtime.sync({
        action: ACTION.CREATE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(runtime.runtime.processTimeout)
        runtime.runtime.processTimeout = setTimeout(() => runtime.process(), 1000)
    }
}

export async function updatedHook(name, context) {
    if (!runtime.started) return

    const synced = await runtime.sync({
        action: ACTION.UPDATE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(runtime.runtime.processTimeout)
        runtime.runtime.processTimeout = setTimeout(() => runtime.process(), 1000)
    }
}

export async function triggeredHook(name, context) {
    if (!runtime.started) return

    const synced = await runtime.sync({
        action: ACTION.TRIGGER, 
        name,
        context
    })

    if (synced) {
        clearTimeout(runtime.runtime.processTimeout)
        runtime.runtime.processTimeout = setTimeout(() => runtime.process(), 1000)
    }
}

export async function deletedHook(name, context) {
    if (!runtime.started) return

    const synced = await runtime.sync({
        action: ACTION.DELETE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(runtime.runtime.processTimeout)
        runtime.runtime.processTimeout = setTimeout(() => runtime.process(), 1000)
    }
}

export function watch(name, folder, options = { interval: 1000, binaryInterval: 3000, ignored: /[\/\\]\./, ignoreInitial: true }) {
    if (runtime.options.watch !== true) return
    
    chokidar.watch(folder, options)
    .on('all', () => {
        clearTimeout(runtime.runtime.processTimeout)
    })
    .on('add', async fullPath => {
        const relativePath = fullPath.replace(`${folder}/`, '')
        createdHook(name, { relativePath })
    })
    .on('change', async fullPath => {
        const relativePath = fullPath.replace(`${folder}/`, '')
        updatedHook(name, { relativePath })
    })
    .on('unlink', async fullPath => {
        const relativePath = fullPath.replace(`${folder}/`, '')
        deletedHook(name, { relativePath })
    })
}

export function schedule(name, expression, context) {
    if (runtime.options.watch !== true) return
    const logger = useLogger()
    const taks = cron.schedule(expression, async () => {
        logger.info('Scheduled task executed: %s %s', name, expression)
        triggeredHook(name, context)
    }, {
        scheduled: false
    })
    tasks.push(taks)
}

onProcess(() => {
    if (!tasks.length) return
    const logger = useLogger()
    logger.debug('Stopping scheduled tasks: %d', tasks.length)
    for(let task of tasks) {
        task.stop()
    }
})

onFinalized(() => {
    if (!tasks.length) return
    const logger = useLogger()
    logger.debug('Starting scheduled tasks: %d', tasks.length)
    for(let task of tasks) {
        task.start()
    }
})