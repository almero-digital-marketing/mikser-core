import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onSync, constants } from '../index.js'
import path from 'node:path'
import { mkdir, readFile } from 'fs/promises'
import { globby, globbySync } from 'globby'
import _ from 'lodash'

export const collection = 'documents'
export const type = 'document'

onSync(async ({ id, operation, relativePath }) => {
    const uri = path.join(mikser.options.documentsFolder, relativePath)
    switch (operation) {
        case constants.OPERATION_CREATE:
            await createEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection,
                type,
                format: path.extname(relativePath).substring(1).toLowerCase(),
                content: await readFile(uri, 'utf8') 
            })
        break
        case constants.OPERATION_UPDATE:
            await updateEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection,
                type,
                format: path.extname(relativePath).substring(1).toLowerCase(),
                content: await readFile(uri, 'utf8') 
            })
        break
        case constants.OPERATION_DELETE:
            await deleteEntity({
                id,
                collection,
                type,
                format: path.extname(relativePath).substring(1).toLowerCase(),
            })
        break
    }
}, collection)

onLoaded(async () => {
    const logger = useLogger()
    mikser.options.documentsFolder = mikser.config.documents?.documentsFolder || path.join(mikser.options.workingFolder, collection)

    logger.info('Documents folder: %s', mikser.options.documentsFolder)
    await mkdir(mikser.options.documentsFolder, { recursive: true })
    
    watchEntities(collection, mikser.options.documentsFolder)
})

onImport(async () => {
    const logger = useLogger()
    const paths = await globby('**/*', { cwd: mikser.options.documentsFolder })
    logger.info('Importing documents: %d', paths.length)

    return Promise.all(paths.map(async relativePath => {
        const uri = path.join(mikser.options.documentsFolder, relativePath)
        await createEntity({
            id: path.join('/documents', relativePath),
            uri,
            name: relativePath.replace(path.extname(relativePath), ''),
            collection,
            type,
            format: path.extname(relativePath).substring(1).toLowerCase(),
            content: await readFile(uri, 'utf8') 
        })
    }))
})