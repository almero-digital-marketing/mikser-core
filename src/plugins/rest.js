import path from 'node:path'
import { writeFile, unlink, mkdir, access } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import Queue from 'p-queue'

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

        // `runtime.process()` is not reentrant — interleaving render cycles
        // races on the journal and the worker pool. Serialize them.
        const renderQueue = new Queue({ concurrency: 1 })

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
                await renderQueue.add(async () => {
                    const correlationId = randomUUID()
                    const entity = { ...req.body, _correlationId: correlationId }
                    const timeout = runtime.config.rest?.renderTimeout ?? 30_000

                    const completedHooks = runtime.hooks.completed
                    let hook
                    const removeHook = () => {
                        if (!hook) return
                        const idx = completedHooks.indexOf(hook)
                        if (idx >= 0) completedHooks.splice(idx, 1)
                    }

                    const { output, entity: resolvedEntity } = await new Promise((resolve, reject) => {
                        const timer = setTimeout(() => {
                            removeHook()
                            reject(new Error(`Render timeout for ${entity.id}`))
                        }, timeout)

                        hook = async (entry) => {
                            if (entry.entity?._correlationId !== correlationId) return
                            clearTimeout(timer)
                            removeHook()
                            resolve({ output: entry.output, entity: entry.entity })
                        }
                        completedHooks.push(hook)

                        updateEntity(entity)
                            .then(() => runtime.process())
                            .catch((err) => {
                                clearTimeout(timer)
                                removeHook()
                                reject(err)
                            })
                    })

                    await sendRenderOutput(res, output, resolvedEntity)
                })
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
