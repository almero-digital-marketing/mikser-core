import path from 'node:path'
import { mkdir, readFile } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'

export default ({
    runtime,
    onLoaded,
    useLogger,
    onImport,
    createEntity,
    updateEntity,
    deleteEntity,
    watch,
    onSync,
    trackProgress,
    updateProgress,
    constants: { ACTION }
}) => {
    const collection = 'documents'
    const type = 'document'

    onSync(collection, async ({ action, context }) => {
        if (!context.relativePath) return false
        const { relativePath } = context
        const id = path.join(`/${collection}`, relativePath)
        const uri = path.join(runtime.options.documentsFolder, relativePath)
        switch (action) {
            case ACTION.CREATE:
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
            case ACTION.UPDATE:
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
            case ACTION.DELETE:
                await deleteEntity({
                    id,
                    collection,
                    type,
                    format: path.extname(relativePath).substring(1).toLowerCase(),
                })
                break
        }
    })

    onLoaded(async () => {
        const logger = useLogger()
        runtime.options.documents = runtime.config.documents?.documentsFolder || collection
        runtime.options.documentsFolder = path.join(runtime.options.workingFolder, runtime.options.documents)

        logger.info('Documents folder: %s', runtime.options.documentsFolder)
        await mkdir(runtime.options.documentsFolder, { recursive: true })

        watch(collection, runtime.options.documentsFolder)
    })

    onImport(async () => {
        const paths = await globby('**/*', { cwd: runtime.options.documentsFolder })

        trackProgress('Documents import', paths.length)
        return Promise.all(paths.map(async relativePath => {
            const uri = path.join(runtime.options.documentsFolder, relativePath)
            await createEntity({
                id: path.join(`/${collection}`, relativePath),
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection,
                type,
                format: path.extname(relativePath).substring(1).toLowerCase(),
                content: await readFile(uri, 'utf8')
            })
            updateProgress()
        }))
    })

    return {
        collection,
        type
    }
}