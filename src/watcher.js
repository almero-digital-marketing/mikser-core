import { mikser, operations } from './index.js'
import chokidar from 'chokidar'
import path from 'path'

let processTimeout

export function watchEntities(collection, folder, options = { interval: 1000, binaryInterval: 3000, ignored: /[\/\\]\./, ignoreInitial: true },) {
    if (mikser.options.watch === true || mikser.options.watch.indexOf(collection) > -1)
    chokidar.watch(folder, options)
    .on('all', () => {
        clearTimeout(processTimeout)
    })
    .on('add', async fullPath => {
        const relativePath = fullPath.replace(folder, '')
        await mikser.sync({
            operation: operations.CREATE, 
            id: path.join(`/${collection}`, relativePath)
        })

        clearTimeout(processTimeout)
        processTimeout = setTimeout(() => mikser.process(), 1000)
    })
    .on('change', async fullPath => {
        const relativePath = fullPath.replace(folder, '')
        await mikser.sync({
            operation: operations.UPDATE, 
            id: path.join(`/${collection}`, relativePath)
        })

        clearTimeout(processTimeout)
        processTimeout = setTimeout(() => mikser.process(), 1000)
    })
    .on('unlink', async fullPath => {
        const relativePath = fullPath.replace(folder, '')
        await mikser.sync({
            operation: operations.DELETE, 
            id: path.join(`/${collection}`, relativePath)
        })

        clearTimeout(processTimeout)
        processTimeout = setTimeout(() => mikser.process(), 1000)
    })
}