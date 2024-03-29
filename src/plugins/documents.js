import path from 'node:path'
import { mkdir, readFile } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'

export default ({ 
    mikser, 
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
        const uri = path.join(mikser.options.documentsFolder, relativePath)
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
        mikser.options.documents = mikser.config.documents?.documentsFolder || collection
        mikser.options.documentsFolder = path.join(mikser.options.workingFolder, mikser.options.documents)
    
        logger.info('Documents folder: %s', mikser.options.documentsFolder)
        await mkdir(mikser.options.documentsFolder, { recursive: true })
        
        watch(collection, mikser.options.documentsFolder)
    })
    
    onImport(async () => {
        const paths = await globby('**/*', { cwd: mikser.options.documentsFolder })

        trackProgress('Documents import', paths.length)
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
            updateProgress()
        }))
    })

    return {
        collection,
        type
    }
}