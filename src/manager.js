import mikser from './mikser.js'
import chokidar from 'chokidar'
import cron from 'node-cron'
import { constants  } from './constants.js'
import { onProcess, onFinalized } from './lifecycle.js'
import { useLogger } from './runtime.js'

const tasks = []

export async function createdHook(name, context) {
    const synced = await mikser.sync({
        operation: constants.OPERATION_CREATE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export async function updatedHook(name, context) {
    const synced = await mikser.sync({
        operation: constants.OPERATION_UPDATE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export async function scheduleHook(name, context) {
    const synced = await mikser.sync({
        operation: constants.OPERATION_SCHEDULE, 
        name,
        context
    })

    if (synced) {
        clearTimeout(mikser.runtime.processTimeout)
        mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
    }
}

export async function deletedHook(name, context) {
    const synced = await mikser.sync({
        operation: constants.OPERATION_DELETE, 
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

    const taks = cron.schedule(expression, async () => {
        scheduleHook(name, context)
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