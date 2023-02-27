import mikser from './mikser.js'
import { useLogger } from './runtime.js'
import { onLoaded, onPersist, onFinalized, onAfterRender, useJournal } from './lifecycle.js'
import { OPERATION } from './constants.js'
import { Low } from 'lowdb'
import path from 'node:path'
import { JSONFile } from 'lowdb/node'
import _ from 'lodash'

let database

onLoaded(async () => {
    const adapter = new JSONFile(path.join(mikser.options.runtimeFolder, `database.${mikser.options.mode}.json`))
    database = new Low(adapter)
    database.data = {
        entities: [],
        results: []
    }
    database.chain = _.chain(database).get('data')
    mikser.database = database
})

onPersist(async () => {
    const logger = useLogger()
    for (let { operation, entity } of mikser.journal) {
        switch (operation) {
            case OPERATION.CREATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database.data.entities.push(entity)
            break
            case OPERATION.UPDATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database
                .chain
                .get('entities')
                .find({ id: entity.id })
                .assign(entity)
                .value()
            break
            case OPERATION.DELETE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database
                .chain
                .get('entities')
                .remove({ id: entity.id })
                .value()
            break
        }
    }
})

onAfterRender(async () => {
    for(let { success, entity } of useJournal(OPERATION.RENDER)) {
        if (success && entity.output) {
            const index = database
            .chain
            .get('results')
            .findIndex({ id: entity.id, destinatoin: entity.destinatoin })
            .value()
            if (index < 0) {
                database.data.results.push(entity)
            } else {
                Object.assign(database.data.results[index], entity)
            }
        }
    }
})

onFinalized(async () => {
    await database.write()
})

export async function findEntity(query) {
    if (!query) return
    return database
    .chain
    .get('entities')
    .find(query)
    .value()
}

export async function findEntities(query) {
    if (!query) {
        return database.chain.get('entities').value()
    }
    return database
    .chain
    .get('entities')
    .filter(query)
    .value()
}