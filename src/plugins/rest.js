import path from 'node:path'
import { writeFile, unlink, mkdir, access } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

// MIME type lookup used when streaming a postprocessor's output back over
// HTTP. The renderer's output extension lives on entity.destination
// (assigned by the layouts plugin), so we use it as the source of truth.
const MIME_BY_EXT = {
    pdf: 'application/pdf',
    html: 'text/html; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    xhtml: 'application/xhtml+xml; charset=utf-8',
    rss: 'application/rss+xml; charset=utf-8',
    atom: 'application/atom+xml; charset=utf-8',
    json: 'application/json; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
}

export function mimeForEntity(entity) {
    if (!entity?.destination) return null
    const ext = path.extname(entity.destination).toLowerCase().replace(/^\./, '')
    return MIME_BY_EXT[ext] ?? null
}

// Decide how to send the render output over HTTP. Exported (and pure-ish)
// so tests can exercise the branching without spinning up a real server.
export async function sendRenderOutput(res, output, entity) {
    if (output == null || output.result == null) {
        return res.status(204).send()
    }
    const result = output.result
    const mime = mimeForEntity(entity)

    if (Buffer.isBuffer(result)) {
        if (mime) res.type(mime)
        return res.send(result)
    }
    if (typeof result === 'string') {
        // A few postprocessors might return an absolute path to a generated
        // file rather than its contents. Only attempt this when the string
        // looks plausibly path-shaped — short, starts with a slash, and the
        // file actually exists. Otherwise treat it as content.
        if (result.length < 4096 && (result.startsWith('/') || /^[A-Za-z]:[\\/]/.test(result))) {
            try {
                await access(result)
                return res.sendFile(result)
            } catch { /* not a path, fall through */ }
        }
        if (mime) res.type(mime)
        return res.send(result)
    }
    // Anything else (plain object, etc.) is sent as JSON.
    return res.json(result)
}

export default ({
    runtime,
    onLoaded,
    useLogger,
    updateEntity,
    findEntities,
}) => {
    onLoaded(async () => {
        const logger = useLogger()

        const { default: express } = await import('express').catch(() => {
            throw new Error('express is required for the rest plugin — run: npm install express')
        })

        const ownApp = !runtime.options.app
        const app = runtime.options.app ?? express()

        const router = express.Router()
        router.use(express.json())

        const token = runtime.config.rest?.token
        const auth = (req, res, next) => {
            if (!token) return next()
            if (req.headers.authorization === `Bearer ${token}`) return next()
            res.status(401).json({ error: 'Unauthorized' })
        }

        function collectionFolder(collection) {
            return runtime.options[`${collection}Folder`]
        }

        // `runtime.process()` is not reentrant — interleaving cycles would
        // race on the journal. Instead of serializing requests, we coalesce
        // concurrent /render calls into the next process() cycle: each call
        // adds its entity (tagged with a correlation id) to a pending batch,
        // a single completed-hook resolves every promise as its entry comes
        // through, and we kick off one cycle per batch. Real parallelism
        // happens inside the cycle via Piscina (runtime.options.threads).
        let pending = []
        let cycleRunning = false

        async function runBatch() {
            if (cycleRunning || pending.length === 0) return
            cycleRunning = true

            const batch = pending
            pending = []
            const timeoutMs = runtime.config.rest?.renderTimeout ?? 30_000

            // One hook for the entire batch; routes each entry's completion
            // to the right pending promise by correlation id.
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

            // Per-request timeouts so a slow entity doesn't block a fast one
            // from being rejected on its own clock.
            for (const item of batch) {
                item.timer = setTimeout(() => {
                    if (remaining.delete(item.correlationId)) {
                        item.reject(new Error(`Render timeout for ${item.entity.id}`))
                    }
                }, timeoutMs)
            }

            try {
                // Submit every entity in the batch before running one cycle.
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
                // Anything not resolved by the cycle and not yet timed out:
                // the cycle finished without firing the hook for it. Reject.
                for (const item of remaining.values()) {
                    clearTimeout(item.timer)
                    item.reject(new Error(`Render did not complete for ${item.entity.id}`))
                }
                const idx = completedHooks.indexOf(hook)
                if (idx >= 0) completedHooks.splice(idx, 1)
                cycleRunning = false
                // New requests that arrived during the cycle form the next batch.
                if (pending.length) setImmediate(runBatch)
            }
        }

        function enqueueRender(entity) {
            return new Promise((resolve, reject) => {
                pending.push({
                    entity,
                    correlationId: entity._correlationId,
                    resolve,
                    reject,
                    timer: null,
                })
                // Defer one tick so concurrent handlers can join this batch
                // before we start the cycle.
                if (!cycleRunning) setImmediate(runBatch)
            })
        }

        router.get('/entities', async (req, res) => {
            try {
                const { page: rawPage, limit: rawLimit, ...filter } = req.query
                const page = Math.max(1, parseInt(rawPage) || 1)
                const limit = Math.min(100, Math.max(1, parseInt(rawLimit) || (runtime.config.rest?.pageSize ?? 10)))
                const query = Object.keys(filter).length ? filter : undefined

                const all = await findEntities(query)
                const total = all.length
                const totalPages = Math.ceil(total / limit)
                const items = all.slice((page - 1) * limit, page * limit)

                res.json({
                    items,
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1,
                })
            } catch (err) {
                logger.error('REST list error: %s', err.message)
                res.status(500).json({ error: err.message })
            }
        })

        router.put('/entities', auth, async (req, res) => {
            try {
                const { collection, relativePath, content = '' } = req.body
                const folder = collectionFolder(collection)
                if (!folder) return res.status(400).json({ error: `Unknown collection: ${collection}` })
                const uri = path.join(folder, relativePath)
                await mkdir(path.dirname(uri), { recursive: true })
                await writeFile(uri, content, 'utf8')
                res.status(202).json({ ok: true })
            } catch (err) {
                logger.error('REST update error: %s', err.message)
                res.status(500).json({ error: err.message })
            }
        })

        router.delete('/entities', auth, async (req, res) => {
            try {
                const { collection, relativePath } = req.body
                const folder = collectionFolder(collection)
                if (!folder) return res.status(400).json({ error: `Unknown collection: ${collection}` })
                const uri = path.join(folder, relativePath)
                await unlink(uri)
                res.status(202).json({ ok: true })
            } catch (err) {
                logger.error('REST delete error: %s', err.message)
                res.status(500).json({ error: err.message })
            }
        })

        router.post('/render', auth, async (req, res) => {
            try {
                const entity = { ...req.body, _correlationId: randomUUID() }
                const { output, entity: resolvedEntity } = await enqueueRender(entity)
                await sendRenderOutput(res, output, resolvedEntity)
            } catch (err) {
                logger.error('REST render error: %s', err.message)
                if (!res.headersSent) {
                    res.status(500).json({ error: err.message })
                }
            }
        })

        const base = runtime.config.rest?.base ?? '/mikser'
        app.use(base, router)

        if (ownApp) {
            const port = runtime.config.rest?.port ?? 3001
            app.listen(port, () => {
                logger.info('REST plugin listening on port %d', port)
            })
        } else {
            logger.info('REST plugin mounted on %s', base)
        }
    })
}
