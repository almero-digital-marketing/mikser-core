import { mikser } from './index.js'

export async function onInitialize(callback) {
    mikser.hooks.initialize.push(callback)
}

export async function onInitialized(callback) {
    mikser.hooks.initialized.push(callback)
}

export async function onLoad(callback) {
    mikser.hooks.load.push(callback)
}

export async function onLoaded(callback) {
    mikser.hooks.loaded.push(callback)
}

export async function onImport(callback) {
    mikser.hooks.import.push(callback)
}

export async function onImported(callback) {
    mikser.hooks.imported.push(callback)
}

export async function onProcess(callback) {
    mikser.hooks.process.push(callback)
}

export async function onProcessed(callback) {
    mikser.hooks.processed.push(callback)
}

export async function onPersist(callback) {
    mikser.hooks.persist.push(callback)
}

export async function onPersisted(callback) {
    mikser.hooks.persisted.push(callback)
}

export async function onCancel(callback) {
    mikser.hooks.cancel.push(callback)
}

export async function onCancelled(callback) {
    mikser.hooks.cancelled.push(callback)
}

export async function onBeforeRender(callback) {
    mikser.hooks.beforeRender.push(callback)
}

export async function onRender(callback) {
    mikser.hooks.render.push(callback)
}

export async function onAfterRender(callback) {
    mikser.hooks.afterRender.push(callback)
}

export async function onSync(callback, collection) {
    if (collection) {
        mikser.hooks.sync.push(({ operation, id }) => {
            if (id.indexOf('/' + collection) == 0) {
                callback({ operation, id })
            }
        })
    } else {
        mikser.hooks.sync.push(callback)
    }
}