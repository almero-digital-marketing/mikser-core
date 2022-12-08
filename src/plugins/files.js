import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onSync, operations } from '../index.js'
import { join, dirname, extname } from 'path'
import { mkdir, symlink, unlink } from 'fs/promises'
import { globby } from 'globby'

async function ensureLink(relativePath) {
    const uri = join(mikser.options.outputFolder, relativePath)
    const source = join(mikser.options.filesFolder, relativePath)
    try {
        await mkdir(dirname(uri), { recursive: true })
        await symlink(source, uri, 'file')
    } catch (err) {
        if (err.code != 'EEXIST')
        throw err
    }
    return { uri, source }
}

onSync(async ({ id, operation }) => {
    const relativePath = id.replace('/files/', '')

    const uri = join(mikser.options.outputFolder, relativePath)
    const source = join(mikser.options.filesFolder, relativePath)
    const format = extname(relativePath).substring(1).toLowerCase()

    switch (operation) {
        case operations.CREATE:
            await ensureLink(relativePath)
            await createEntity({
                id: join('/files', relativePath),
                uri,
                name: relativePath,
                collection: 'files',
                format,
                source
            })
        break
        case operations.UPDATE:
            await updateEntity({
                id: join('/files', relativePath),
                uri,
                name: relativePath,
                collection: 'files',
                format,
                source
            })
        break
        case operations.DELETE:
            await unlink(join(mikser.options.outputFolder, relativePath))
            await deleteEntity({
                id: join('/files', relativePath),
                collection: 'files',
            })
        break
    }
})

onLoaded(async () => {
    const logger = useLogger()
    mikser.options.filesFolder = mikser.config.files?.folder || join(mikser.options.workingFolder, 'files')

    logger.info('Files: %s', mikser.options.filesFolder)
    await mkdir(mikser.options.filesFolder, { recursive: true })

    watchEntities('files', mikser.options.filesFolder)
})

onImport(async () => {
    await mkdir(mikser.options.outputFolder, { recursive: true }) 
    const paths = await globby('**/*', { cwd: mikser.options.filesFolder })
    for (let relativePath of paths) {
        const { uri, source } = await ensureLink(relativePath)
        await createEntity({
            id: join('/files', relativePath),
            uri,
            collection: 'file',
            format: extname(relativePath).substring(1).toLowerCase(),
            source
        })
    }
})