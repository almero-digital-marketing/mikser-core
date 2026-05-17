// Public, transport-agnostic primitives that the REST plugin's HTTP
// endpoints are thin wrappers over. Library users embedding mikser
// programmatically can import these directly.

import { randomUUID } from 'node:crypto'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Create an on-demand renderer that pipelines concurrent calls into the
 * minimum number of `runtime.process()` cycles. Returns `{ render }`.
 *
 * The renderer is stateful — each call to createRenderer() owns its own
 * batch queue and `completed` hook lifecycle. Mount once per consumer.
 *
 * @param {object} deps
 * @param {object} deps.runtime         - the mikser runtime singleton
 * @param {Function} deps.updateEntity  - lifecycle.updateEntity
 * @param {number} [deps.defaultTimeout=30000] - per-render timeout in ms
 */
export function createRenderer({ runtime, updateEntity, defaultTimeout = 30_000 }) {
    let pending = []
    let cycleRunning = false

    async function runBatch() {
        if (cycleRunning || pending.length === 0) return
        cycleRunning = true

        const batch = pending
        pending = []

        const remaining = new Map(batch.map(b => [b.correlationId, b]))
        const completedHooks = runtime.hooks.completed
        const hook = async (entry) => {
            const cid = entry.entity?._correlationId
            if (!cid) return
            const item = remaining.get(cid)
            if (!item) return
            remaining.delete(cid)
            clearTimeout(item.timer)
            item.resolve({ output: entry.output, entity: entry.entity })
        }
        completedHooks.push(hook)

        for (const item of batch) {
            item.timer = setTimeout(() => {
                if (remaining.delete(item.correlationId)) {
                    item.reject(new Error(`Render timeout for ${item.entity.id}`))
                }
            }, item.timeout)
        }

        try {
            for (const item of batch) {
                await updateEntity(item.entity).catch(item.reject)
            }
            await runtime.process()
        } catch (err) {
            for (const item of remaining.values()) {
                clearTimeout(item.timer)
                item.reject(err)
            }
            remaining.clear()
        } finally {
            for (const item of remaining.values()) {
                clearTimeout(item.timer)
                item.reject(new Error(`Render did not complete for ${item.entity.id}`))
            }
            const idx = completedHooks.indexOf(hook)
            if (idx >= 0) completedHooks.splice(idx, 1)
            cycleRunning = false
            if (pending.length) setImmediate(runBatch)
        }
    }

    /**
     * Submit an entity for rendering. Resolves with `{ output, entity }`
     * where `output.result` is whatever the renderer/postprocessor returned
     * (a string for HTML/text outputs, a Buffer for PDFs, etc.).
     *
     * Requests arriving concurrently are coalesced into the next available
     * `runtime.process()` cycle — within that cycle, mikser's worker pool
     * renders the batch in parallel.
     *
     * @param {object} entity                - any entity-shaped object
     * @param {object} [opts]
     * @param {number} [opts.timeout]        - override the default timeout
     * @returns {Promise<{output, entity}>}
     */
    function render(entity, { timeout = defaultTimeout } = {}) {
        return new Promise((resolve, reject) => {
            const correlationId = randomUUID()
            pending.push({
                entity: { ...entity, _correlationId: correlationId },
                correlationId,
                timeout,
                resolve,
                reject,
                timer: null,
            })
            if (!cycleRunning) setImmediate(runBatch)
        })
    }

    return { render }
}

/**
 * Create the filesystem-level entity I/O helpers: `writeContent` and
 * `removeContent`. These operate on the collection folders (e.g.
 * documents/, files/) which are watched by mikser's collection plugins;
 * in watch mode, edits made through these functions trigger a sync event
 * and a re-process cycle.
 *
 * Distinct from `lifecycle.updateEntity` and `lifecycle.deleteEntity` —
 * those write journal entries directly. These write actual files.
 */
export function createEntityIo({ runtime }) {
    function collectionFolder(collection) {
        return runtime.options[`${collection}Folder`]
    }

    async function writeContent(collection, relativePath, content = '') {
        const folder = collectionFolder(collection)
        if (!folder) throw new Error(`Unknown collection: ${collection}`)
        const uri = path.join(folder, relativePath)
        await mkdir(path.dirname(uri), { recursive: true })
        await writeFile(uri, content, 'utf8')
        return uri
    }

    async function removeContent(collection, relativePath) {
        const folder = collectionFolder(collection)
        if (!folder) throw new Error(`Unknown collection: ${collection}`)
        const uri = path.join(folder, relativePath)
        await unlink(uri)
    }

    return { writeContent, removeContent }
}
