import runtime from './runtime.js'
import { onLoaded, onCancelled, onFinalized } from './lifecycle.js'
import { unlink } from 'fs/promises'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { eq, inArray, sql, asc } from 'drizzle-orm'
import path from 'path'
import { stopProgress, trackProgress, updateProgress } from './tracking.js'
import { AbortError } from './utils.js'

const operations = sqliteTable('operations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    operation: text('operation'),
    entity: text('entity'),
    context: text('context'),
    options: text('options'),
    output: text('output'),
})

let db
let sqlite

export async function addEntry({ entity, operation, context, options }) {
    db.insert(operations).values({
        entity: JSON.stringify(entity),
        operation,
        context: JSON.stringify(context),
        options: JSON.stringify(options)
    }).run()
}

export async function addEntries(entries) {
    const BATCH_SIZE = 10
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE).map(({ entity, operation, context, options }) => ({
            entity: JSON.stringify(entity),
            operation,
            context: JSON.stringify(context),
            options: JSON.stringify(options)
        }))
        db.insert(operations).values(batch).run()
    }
}

export async function updateEntry({ id, entity, output }) {
    const data = {}
    if (entity) data.entity = JSON.stringify(entity)
    if (output) data.output = JSON.stringify(output)
    db.update(operations).set(data).where(eq(operations.id, id)).run()
}

export async function* useJournal(name, ops, signal) {
    const where = ops?.length ? inArray(operations.operation, ops) : undefined

    const countQuery = where
        ? db.select({ total: sql`count(*)` }).from(operations).where(where)
        : db.select({ total: sql`count(*)` }).from(operations)
    const [{ total }] = countQuery.all()
    if (!total) return

    trackProgress(name, Number(total))

    let offset = 0
    const limit = 1000
    let rowCount = 0
    do {
        rowCount = 0
        const rowQuery = where
            ? db.select().from(operations).where(where).orderBy(asc(operations.id)).limit(limit).offset(offset)
            : db.select().from(operations).orderBy(asc(operations.id)).limit(limit).offset(offset)
        const rows = rowQuery.all()
        for (let { id, entity, operation, context, options, output } of rows) {
            if (signal?.aborted) {
                stopProgress()
                throw new AbortError()
            }
            rowCount++
            updateProgress()
            yield {
                id,
                entity: JSON.parse(entity),
                operation,
                context: JSON.parse(context),
                options: JSON.parse(options),
                output: JSON.parse(output)
            }
        }
        offset += limit
    } while (rowCount == limit)
}

export async function clearJournal(aborted) {
    db.delete(operations).run()
    if (!aborted) {
        if (runtime.options.watch !== true) {
            sqlite.close()
        }
    }
}

onLoaded(async () => {
    const filename = path.join(runtime.options.runtimeFolder, `journal.db`)
    try {
        await unlink(filename)
    } catch {}

    sqlite = new Database(filename)
    db = drizzle(sqlite)

    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS operations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation TEXT,
            entity TEXT,
            context TEXT,
            options TEXT,
            output TEXT
        )
    `)
    sqlite.exec(`CREATE INDEX IF NOT EXISTS operation_idx ON operations (operation)`)
})

onFinalized(async (signal) => {
    await clearJournal(signal.aborted)
})

onCancelled(async () => {
    await clearJournal(true)
})
