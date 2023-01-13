import mikser from './mikser.js'
import chokidar from 'chokidar'
import cron from 'node-cron'
import { constants  } from './constants.js'

export function watch(name, folder, options = { interval: 1000, binaryInterval: 3000, ignored: /[\/\\]\./, ignoreInitial: true }) {
    if (mikser.options.watch !== true) return
    
    chokidar.watch(folder, options)
    .on('all', () => {
        clearTimeout(mikser.runtime.processTimeout)
    })
    .on('add', async fullPath => {
        const relativePath = fullPath.replace(`${folder}/`, '')
        const synced = await mikser.sync({
            operation: constants.OPERATION_CREATE, 
            name,
            context: { relativePath }
        })

        if (synced) {
            clearTimeout(mikser.runtime.processTimeout)
            mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
        }
    })
    .on('change', async fullPath => {
        const relativePath = fullPath.replace(`${folder}/`, '')
        const synced = await mikser.sync({
            operation: constants.OPERATION_UPDATE, 
            name,
            context: { relativePath }
        })

        if (synced) {
            clearTimeout(mikser.runtime.processTimeout)
            mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
        }
    })
    .on('unlink', async fullPath => {
        const relativePath = fullPath.replace(`${folder}/`, '')
        const synced = await mikser.sync({
            operation: constants.OPERATION_DELETE, 
            name,
            context: { relativePath }
        })

        if (synced) {
            clearTimeout(mikser.runtime.processTimeout)
            mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
        }
    })
}

export function schedule(name, expression, context) {
    if (mikser.options.watch !== true) return

    cron.schedule(expression, async () => {
        const synced = await mikser.sync({
            operation: constants.OPERATION_SCHEDULE, 
            name,
            context
        })

        if (synced) {
            clearTimeout(mikser.runtime.processTimeout)
            mikser.runtime.processTimeout = setTimeout(() => mikser.process(), 1000)
        }
    })
}