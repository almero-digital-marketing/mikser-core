import Mikser from './mikser.js'

export async function onInitialize(callback) {
    Mikser.hooks.initialize.push(callback)
}

export async function onInitialized(callback) {
    Mikser.hooks.initialized.push(callback)
}

export async function onLoad(callback) {
    Mikser.hooks.load.push(callback)
}

export async function onLoaded(callback) {
    Mikser.hooks.loaded.push(callback)
}

export async function onImport(callback) {
    Mikser.hooks.import.push(callback)
}

export async function onImported(callback) {
    Mikser.hooks.imported.push(callback)
}

export async function onProcess(callback) {
    Mikser.hooks.process.push(callback)
}

export async function onProcessed(callback) {
    Mikser.hooks.processed.push(callback)
}

export async function onPersist(callback) {
    Mikser.hooks.persist.push(callback)
}

export async function onPersisted(callback) {
    Mikser.hooks.persisted.push(callback)
}

export async function onCancel(callback) {
    Mikser.hooks.cancel.push(callback)
}

export async function onCancelled(callback) {
    Mikser.hooks.cancelled.push(callback)
}

export async function onBeforeRender(callback) {
    Mikser.hooks.beforeRender.push(callback)
}

export async function onRender(callback) {
    Mikser.hooks.render.push(callback)
}

export async function onAfterRender(callback) {
    Mikser.hooks.afterRender.push(callback)
}

export async function onFinalize(callback) {
    Mikser.hooks.finalize.push(callback)
}

export async function onFinalized(callback) {
    Mikser.hooks.finalized.push(callback)
}

export async function onSync(callback, collection) {
    if (collection) {
        Mikser.hooks.sync.push(async (operation) => {
            if (operation.id.indexOf('/' + collection) == 0) {
                return await callback(operation)
            }
        })
    } else {
        Mikser.hooks.sync.push(callback)
    }
}