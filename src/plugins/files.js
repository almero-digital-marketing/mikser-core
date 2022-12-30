import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onSync, constants, findEntity } from '../index.js'
import path from 'node:path'
import { mkdir, symlink, unlink } from 'fs/promises'
import { globby } from 'globby'
import hasha from 'hasha'

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

onSync(async ({ id, operation }) => {
    const relativePath = id.replace('/files/', '')

    const uri = path.join(mikser.options.outputFolder, relativePath)
    const source = path.join(mikser.options.filesFolder, relativePath)
    const format = path.extname(relativePath).substring(1).toLowerCase()
    
    let synced = true
    switch (operation) {
        case constants.OPERATION_CREATE:
            var checksum = await hasha.fromFile(source, { algorithm: 'md5' })
            await ensureLink(relativePath)
            await createEntity({
                id,
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection: 'files',
                type: 'file',
                format,
                source,
                checksum
            })
        break
        case constants.OPERATION_UPDATE:
            const current = await findEntity({ id })
            var checksum = await hasha.fromFile(source, { algorithm: 'md5' })
            if (current.checksum != checksum) {
                await updateEntity({
                    id,
                    uri,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    collection: 'files',
                    type: 'file',
                    format,
                    source,
                    checksum
                })
            } else {
                synced = false
            }
        break
        case constants.OPERATION_DELETE:
            await unlink(path.join(mikser.options.outputFolder, relativePath))
            await deleteEntity({
                id,
                collection: 'files',
                type: 'file',
            })
        break
    }
    return synced
}, 'files')

onLoaded(async () => {
    const logger = useLogger()
    mikser.options.filesFolder = mikser.config.files?.filesFolder || path.join(mikser.options.workingFolder, 'files')

    logger.info('Files: %s', mikser.options.filesFolder)
    await mkdir(mikser.options.filesFolder, { recursive: true })

    watchEntities('files', mikser.options.filesFolder)
})

onImport(async () => {
    await mkdir(mikser.options.outputFolder, { recursive: true }) 
    const paths = await globby('**/*', { cwd: mikser.options.filesFolder })
    return Promise.all(paths.map(async relativePath => {
        const { uri, source } = await ensureLink(relativePath)
        const checksum = await hasha.fromFile(source, { algorithm: 'md5' })

        await createEntity({
            id: path.join('/files', relativePath),
            uri,
            collection: 'files',
            type: 'file',
            format: path.extname(relativePath).substring(1).toLowerCase(),
            name: relativePath,
            source,
            checksum
        })
    }))
})