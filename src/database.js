// import { mikser, onLoaded, useLogger, onPersist, constants, onFinalized, onAfterRender, useOperations } from './index.js'
import mikser from './mikser.js'
import { useLogger, useOperations } from './runtime.js'
import { onLoaded, onPersist, onFinalized, onAfterRender } from './lifecycle.js'
import { constants  } from './constants.js'
import { Low } from 'lowdb'
import path from 'node:path'
import { JSONFile } from 'lowdb/node'
import _ from 'lodash'

let database

onLoaded(async () => {
    const adapter = new JSONFile(path.join(mikser.options.runtimeFolder, 'database.json'))
    database = new Low(adapter)
    database.data = {
        entities: [],
        results: []
    }
    database.chain = _.chain(database).get('data')
})

onPersist(async () => {
    const logger = useLogger()
    for (let { operation, entity } of mikser.operations) {
        switch (operation) {
            case constants.OPERATION_CREATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database.data.entities.push(entity)
            break
            case constants.OPERATION_UPDATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database
                .chain
                .get('entities')
                .find({ id: entity.id })
                .assign(entity)
                .value()
            break
            case constants.OPERATION_DELETE:
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
    const entitiesToRender = useOperations([constants.OPERATION_RENDER])
    for(let { result, entity } of entitiesToRender) {
        if (result) {
            const index = database
            .chain
            .get('results')
            .findIndex({ id: entity.id })
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

export function useDatabase() {
    return database
}