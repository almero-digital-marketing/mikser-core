import mikser from './mikser.js'
import { useLogger } from './runtime.js'
import { onLoaded, onPersist, onFinalized } from './lifecycle.js'
import { useJournal } from './journal.js'
import { OPERATION } from './constants.js'
import { Low } from 'lowdb'
import path from 'node:path'
import { JSONFile } from 'lowdb/node'
import _ from 'lodash'

let catalog

onLoaded(async () => {
    const adapter = new JSONFile(path.join(mikser.options.runtimeFolder, `catalog.json`))
    catalog = new Low(adapter)
    catalog.data = {
        entities: [],
    }
    catalog.chain = _.chain(catalog).get('data')
    mikser.catalog = catalog
})

onPersist(async () => {
    const logger = useLogger()
    for await (let { operation, entity } of useJournal('Catalog')) {
        switch (operation) {
            case OPERATION.CREATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                catalog.data.entities.push(entity)
            break
            case OPERATION.UPDATE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                catalog
                .chain
                .get('entities')
                .find({ id: entity.id })
                .assign(entity)
                .value()
            break
            case OPERATION.DELETE:
                logger.trace('Database %s %s: %s', entity.collection, operation, entity.id)
                catalog
                .chain
                .get('entities')
                .remove({ id: entity.id })
                .value()
            break
        }
    }
})

onFinalized(async () => {
    await catalog.write()
})

export async function findEntity(query) {
    if (!query) return
    return catalog
    .chain
    .get('entities')
    .find(query)
    .value()
}

export async function findEntities(query) {
    if (!query) {
        return catalog.chain.get('entities').value()
    }
    return catalog
    .chain
    .get('entities')
    .filter(query)
    .value()
}