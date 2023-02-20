import mikser from './mikser.js'
import { OPERATION } from './constants.js'
import { useLogger } from './runtime.js'

export function* useJournal(...args) {
    for(let entry of mikser.journal) {
        const { operation } = entry
        if (args.indexOf(operation) != -1) {
            yield entry
        }
    }
}

export function clearJournal(aborted) {
    if (aborted) {
        mikser.journal = mikser.journal.filter(({ options }) => options?.abortable !== false)
    } else {
        mikser.journal = []
    }
}

export async function createEntity(entity) {
    const logger = useLogger()
    entity.stamp = mikser.stamp
    entity.time = Date.now()
    const entry = { operation: OPERATION.CREATE, entity }
    if (await mikser.validate(entry)) {
        logger.debug('Create %s entity: %s', entity.collection, entity.id)
        mikser.journal.push(entry)
    }
}

export async function deleteEntity({ id, collection, type }) {
    const logger = useLogger()
    const entry = { operation: OPERATION.DELETE, entity: { id, type, collection } }
    if (await mikser.validate(entry)) {
        logger.debug('Delete %s entity: %s %s', collection, type, id)
        mikser.journal.push(entry)
    }
}

export async function updateEntity(entity) {
    const logger = useLogger()
    entity.stamp = mikser.stamp
    entity.time = Date.now()
    const entry = { operation: OPERATION.UPDATE, entity }
    if (await mikser.validate(entry)) {
        logger.debug('Update %s entity: %s', entity.collection, entity.id)
        mikser.journal.push(entry)
    }
}

export async function renderEntity(entity, options = {}, context = {}) {
    const logger = useLogger()
    const entry = { operation: OPERATION.RENDER, entity, options, context, }
    if (await mikser.validate(entry)) {
        logger.debug('Render %s entity: [%s] %s → %s', entity.collection, options.renderer, entity.id, entity.destination)
        mikser.journal.push(entry)
    }
}

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

export async function onProcess(callback, once) {
    if (!once) mikser.hooks.process.push(callback)
    else {
        let called = false
        mikser.hooks.process.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onProcessed(callback, once) {
    if (!once) mikser.hooks.processed.push(callback)
    else {
        let called = false
        mikser.hooks.processed.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onPersist(callback, once) {
    if (!once) mikser.hooks.persist.push(callback)
    else {
        let called = false
        mikser.hooks.persist.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onPersisted(callback, once) {
    if (!once) mikser.hooks.persisted.push(callback)
    else {
        let called = false
        mikser.hooks.persisted.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onCancel(callback) {
    mikser.hooks.cancel.push(callback)
}

export async function onCancelled(callback) {
    mikser.hooks.cancelled.push(callback)
}

export async function onBeforeRender(callback, once) {
    if (!once) mikser.hooks.beforeRender.push(callback)
    else {
        let called = false
        mikser.hooks.beforeRender.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onRender(callback, once) {
    if (!once) mikser.hooks.render.push(callback)
    else {
        let called = false
        mikser.hooks.render.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onAfterRender(callback, once) {
    if (!once) mikser.hooks.afterRender.push(callback)
    else {
        let called = false
        mikser.hooks.afterRender.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onFinalize(callback, once) {
    if (!once) mikser.hooks.finalize.push(callback)
    else {
        let called = false
        mikser.hooks.finalize.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export async function onFinalized(callback, once) {
    if (!once) mikser.hooks.finalized.push(callback)
    else {
        let called = false
        mikser.hooks.finalized.push((signal) => {
            if (!called) {
                called = true
                callback(signal)
            } 
        })
    }
}

export function onSync(name, callback) {
    mikser.hooks.sync.push(async (operation) => {
        if (operation.name == name) {
            return await callback(operation)
        }
    })
}

export function onValidate(operations, callback) {
    const logger = useLogger()
    mikser.validators.push(async (entry) => {
        if (operations.indexOf(entry.operation) != -1) {
            try {
                const message = await callback(entry)
                if (message) {
                    logger.warning('Validation problem: [%s] %s %s', entry.operation, entry.entity.name, message)
                }
                return true
            } catch (err) {
                logger.error('Validation error: [%s] %s %s', entry.operation, entry.entity.name, err.message)
                return false
            }
        }
    })
}