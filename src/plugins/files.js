import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onSync, constants, findEntity, checksum } from '../index.js'
import path from 'node:path'
import { mkdir, symlink, unlink } from 'fs/promises'
import { globby } from 'globby'

export const collection = 'files'
export const type = 'file'

async function ensureLink(relativePath) {
    const uri = path.join(mikser.options.outputFolder, relativePath)
    const source = path.join(mikser.options.filesFolder, relativePath)
    try {
        await mkdir(path.dirname(uri), { recursive: true })
        await symlink(source, uri, 'file')
    } catch (err) {
        if (err.code != 'EEXIST')
        throw err
    }
    return { uri, source }
}

onSync(async ({ id, operation, relativePath }) => {
    const uri = path.join(mikser.options.outputFolder, relativePath)
    const source = path.join(mikser.options.filesFolder, relativePath)
    const format = path.extname(relativePath).substring(1).toLowerCase()
    
    let synced = true
    switch (operation) {
        case constants.OPERATION_CREATE:
            await ensureLink(relativePath)
            await createEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection,
                type,
                format,
                source,
                checksum: await checksum(source)
            })
        break
        case constants.OPERATION_UPDATE:
            const current = await findEntity({ id })
            if (current.checksum != checksum) {
                await updateEntity({
                    id,
                    uri,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    collection,
                    type,
                    format,
                    source,
                    checksum: await checksum(source)
                })
            } else {
                synced = false
            }
        break
        case constants.OPERATION_DELETE:
            await unlink(path.join(mikser.options.outputFolder, relativePath))
            await deleteEntity({
                id,
                collection,
                type,
            })
        break
    }
    return synced
}, collection)

onLoaded(async () => {
    const logger = useLogger()
    mikser.options.files = mikser.config.files?.files || collection
    mikser.options.filesFolder = path.join(mikser.options.workingFolder, mikser.options.files)

    logger.info('Files folder: %s', mikser.options.filesFolder)
    await mkdir(mikser.options.filesFolder, { recursive: true })

    watchEntities(collection, mikser.options.filesFolder)
})

onImport(async () => {
    const logger = useLogger()
    await mkdir(mikser.options.outputFolder, { recursive: true }) 
    const paths = await globby('**/*', { cwd: mikser.options.filesFolder })
    logger.info('Importing files: %d', paths.length)

    return Promise.all(paths.map(async relativePath => {
        const { uri, source } = await ensureLink(relativePath)

        await createEntity({
            id: path.join('/files', relativePath),
            uri,
            collection,
            type,
            format: path.extname(relativePath).substring(1).toLowerCase(),
            name: relativePath,
            source,
            checksum: await checksum(source)
        })
    }))
})