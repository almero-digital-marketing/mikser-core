import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onSync, constants } from '../index.js'
import path from 'path'
import { mkdir, readFile } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'

onSync(async ({ id, operation }) => {
    const relativePath = id.replace('/documents/', '')
    const uri = path.join(mikser.options.documentsFolder, relativePath)
    switch (operation) {
        case constants.OPERATION_CREATE:
            await createEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection: 'documents',
                type: 'document',
                format: path.extname(relativePath).substring(1).toLowerCase(),
                content: await readFile(uri, 'utf8') 
            })
        break
        case constants.OPERATION_UPDATE:
            await updateEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection: 'documents',
                type: 'document',
                format: path.extname(relativePath).substring(1).toLowerCase(),
                content: await readFile(uri, 'utf8') 
            })
        break
        case constants.OPERATION_DELETE:
            await deleteEntity({
                id,
                collection: 'documents',
                type: 'document',
                format: path.extname(relativePath).substring(1).toLowerCase(),
            })
        break
    }
}, 'documents')

onLoaded(async () => {
    const logger = useLogger()
    mikser.options.documentsFolder = mikser.config.documents?.folder || path.join(mikser.options.workingFolder, 'documents')

    logger.info('Documents: %s', mikser.options.documentsFolder)
    await mkdir(mikser.options.documentsFolder, { recursive: true })
    
    watchEntities('documents', mikser.options.documentsFolder)
})

onImport(async () => {
    const paths = await globby('**/*', { cwd: mikser.options.documentsFolder })
    return Promise.all(paths.map(async relativePath => {
        const uri = path.join(mikser.options.documentsFolder, relativePath)
        await createEntity({
            id: path.join('/documents', relativePath),
            uri,
            name: relativePath.replace(path.extname(relativePath), ''),
            collection: 'documents',
            type: 'document',
            format: path.extname(relativePath).substring(1).toLowerCase(),
            content: await readFile(uri, 'utf8') 
        })
    }))
})