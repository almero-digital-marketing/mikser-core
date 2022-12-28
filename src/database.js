import { mikser, onLoaded, useLogger, onPersist, constants } from './index.js'
import { Low, Memory } from 'lowdb'
import _ from 'lodash'

let database

onLoaded(async () => {
    const adapter = new Memory()
    database = new Low(adapter)
    database.data = {
        entities: []
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
                .set(entity)
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