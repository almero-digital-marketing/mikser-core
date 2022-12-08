import { mikser, onLoaded, useLogger, onPersist, operations } from '../index.js'
import path from 'path'
import { mkdir } from 'fs/promises'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import _ from 'lodash'

let database

onLoaded(async () => {
    const logger = useLogger()
    mikser.options.databaseFolder = path.join(mikser.options.runtimeFolder, 'database')
    await mkdir(mikser.options.databaseFolder, { recursive: true })
    const databaseFile = path.join(mikser.options.databaseFolder, 'db.json')
    logger.debug('Database: %s', databaseFile)
    const adapter = new JSONFile(databaseFile)
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
            case operations.OPERATION_CREATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database.data.entities.push(entity)
            break
            case operations.OPERATION_UPDTE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database
                .chain
                .get('entities')
                .find({ id: entity.id })
                .set(entity)
                .value()
            break
            case operations.OPERATION_DELETE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                database
                .chain
                .get('entities')
                .remove({ id: entity.id })
                .value()
            break
        }
    }
    await database.write()
})

export async function findEntity(query) {
    return database
    .chain
    .get('entities')
    .find(query)
    .value()
}

export async function findEntities(query) {
    return database
    .chain
    .get('entities')
    .filter(query)
    .value()
}

export {
    database
}