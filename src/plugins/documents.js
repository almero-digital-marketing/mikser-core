import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watch, onSync, constants } from '../../index.js'
import path from 'node:path'
import { mkdir, readFile } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'

export const collection = 'documents'
export const type = 'document'

onSync(async ({ operation, context: { relativePath } }) => {
    if (!relativePath) return false
    const id = path.join(`/${collection}`, relativePath)
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
    mikser.options.documents = mikser.config.documents?.documents || collection
    mikser.options.documentsFolder = path.join(mikser.options.workingFolder, mikser.options.documents)

    logger.info('Documents folder: %s', mikser.options.documentsFolder)
    await mkdir(mikser.options.documentsFolder, { recursive: true })
    
    watch(collection, mikser.options.documentsFolder)
})

onImport(async () => {
    const logger = useLogger()
    const paths = await globby('**/*', { cwd: mikser.options.documentsFolder })
    logger.info('Importing documents: %d', paths.length)

    return Promise.all(paths.map(async relativePath => {
        const uri = path.join(mikser.options.documentsFolder, relativePath)
        await createEntity({
            id: path.join(`/${collection}`, relativePath),
            uri,
            name: relativePath.replace(path.extname(relativePath), ''),
            collection,
            type,
            format: path.extname(relativePath).substring(1).toLowerCase(),
            content: await readFile(uri, 'utf8') 
        })
    }))
})