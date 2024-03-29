import mikser from './mikser.js'
import chokidar from 'chokidar'
import cron from 'node-cron'
import { onProcess, onFinalized } from './lifecycle.js'
import { useLogger } from './runtime.js'
import { ACTION } from './constants.js'

const tasks = []

export async function createdHook(name, context) {
    if (!mikser.started) return

    const synced = await mikser.sync({
        action: ACTION.CREATE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export async function updatedHook(name, context) {
    if (!mikser.started) return

    const synced = await mikser.sync({
        action: ACTION.UPDATE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export async function triggeredHook(name, context) {
    if (!mikser.started) return

    const synced = await mikser.sync({
        action: ACTION.TRIGGER, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export async function deletedHook(name, context) {
    if (!mikser.started) return

    const synced = await mikser.sync({
        action: ACTION.DELETE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export function watch(name, folder, options = { interval: 1000, binaryInterval: 3000, ignored: /[\/\\]\./, ignoreInitial: true }) {
    if (mikser.options.watch !== true) return
    
    chokidar.watch(folder, options)
    .on('all', () => {
        clearTimeout(mikser.runtime.processTimeout)
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
    if (mikser.options.watch !== true) return
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