import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onSync, operations } from '../index.js'
import path from 'path'
import { mkdir, readFile } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'

onSync(async ({ id, operation }) => {
    const relativePath = id.replace('/documents/', '')
    const uri = path.join(mikser.options.documentsFolder, relativePath)
    switch (operation) {
        case operations.CREATE:
            await createEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection: 'documents',
                format: path.extname(relativePath).substring(1).toLowerCase(),
                source: await readFile(uri, 'utf8') 
            })
        break
        case operations.UPDATE:
            await updateEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection: 'documents',
                format: path.extname(relativePath).substring(1).toLowerCase(),
                source: await readFile(uri, 'utf8') 
            })
        break
        case operations.DELETE:
            await deleteEntity({
                id,
                collection: 'documents',
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
    for (let relativePath of paths) {
        const uri = path.join(mikser.options.documentsFolder, relativePath)
        await createEntity({
            id: path.join('/documents', relativePath),
            uri,
            name: relativePath.replace(path.extname(relativePath), ''),
            collection: 'documents',
            format: path.extname(relativePath).substring(1).toLowerCase(),
            source: await readFile(uri, 'utf8') 
        })
    }
})