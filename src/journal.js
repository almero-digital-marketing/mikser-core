import mikser from './mikser.js'
import { onLoaded, onCancelled, onFinalized } from './lifecycle.js'
import { unlink } from 'fs/promises'
import knex from 'knex'
import path from 'path'
import { stopProgress, trackProgress, updateProgress } from './tracking.js'
import { AbortError } from './utils.js'

let journal

export async function addEntry({ entity, operation, context, options }) {
    return journal('operations').insert([{ entity, operation, context, options }])
}

export async function updateEntry({ id, entity, output }) {
    const data = {}
    if ( entity ) data.entity = JSON.stringify(entity)
    if ( output ) data.output = JSON.stringify(output)
    return journal('operations').where({ id }).update(data)
}

export async function* useJournal(name, operations, signal) {
    let query = journal('operations')
    if (operations?.length) {
        query.whereIn('operation', operations)
    }
    let [total] = await query.clone().count()
    total = total['count(*)']
    if (!total) return

    trackProgress(name, total)

    let offset = 0
    const limit = 1000
    let count = 0
    do {
        count = 0
        const entries = await query.clone().orderBy('id').select().offset(offset).limit(limit)
        for (let { id, entity, operation, context, options, output} of entries) {
            if (signal?.aborted) {
                stopProgress()
                throw new AbortError()
            }
            count++
            
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
    } while (count == limit)
}

export async function clearJournal(aborted) {
    if (aborted) {
        await journal('operations').whereJsonPath('options', '$.abortable', '=', true).del()
    } else {
        await journal('operations').del()
        if (mikser.options.watch !== true) {
            journal.destroy()
        }
    }
}

onLoaded(async () => {
    const filename = path.join(mikser.options.runtimeFolder, `journal.db`)
    try {
        await unlink(filename)
    } catch {}

    journal = knex({
        client: 'sqlite3',
        connection: {
            filename
        },
        useNullAsDefault: true
    })

    await journal.schema.createTable('operations', table => {
        table.increments('id')
        table.string('operation').index()
        table.json('entity')
        table.json('context')
        table.json('options')
        table.json('output')
    })
})

onFinalized(async (signal) => {
    clearJournal(signal.aborted)
})

onCancelled(async () => {
    await clearJournal(true)
})