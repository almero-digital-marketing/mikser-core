import path from 'node:path'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import minimatch from 'minimatch'


export default ({ 
    mikser, 
    onLoaded, 
    useLogger, 
    onImport, 
    createEntity, 
    updateEntity, 
    deleteEntity, 
    watch, 
    onProcessed, 
    onBeforeRender, 
    useJournal, 
    renderEntity, 
    onAfterRender, 
    onSync,
    constants: { ACTION, OPERATION }, 
}) => {   
    const collection = 'layouts'
    const type = 'layout'

    function getFormatInfo(relativePath) {
        const template = path.extname(relativePath).substring(1).toLowerCase()
        const format = path.extname(relativePath.replace(path.extname(relativePath),'')).substring(1).toLowerCase() || 'html'
        return { format, template }
    }
    
    function addToSitemap(entity) {
        const logger = useLogger()
        const { sitemap } = mikser.state.layouts
        const { href = '/' + entity.name, lang } = entity.meta || {}
        if (lang) {
            sitemap[href] = sitemap[href] || {};
            let previous = sitemap[href][lang];
            if (previous && (previous.id != entity.id)) {
                logger.warn('Entity with equal href: [%s] %s and %s', previous.collection, previous.id, entity.id);
            }
            sitemap[href][lang] = entity
        }
        else {
            let previous = sitemap[href];
            if (previous && (previous.id != entity.id)) {
                logger.warn('Entity with equal href: [%s] %s and %s', previous.collection, previous.id, entity.id);
            }
            sitemap[href] = entity
        }
    }
    
    function removeFromSitemap(entity) {
        const { sitemap } = mikser.state.layouts
        for (let href in sitemap) {
            let entry = sitemap[href]
            if (entry.id) {
                if (entry.id == entity.id) {
                    delete sitemap[href]
                    return
                } 
            } else {
                for (let lang in entry) {
                    if (entry[lang].id == entity.id) {
                        delete entry[lang]
                        return
                    }
                }
            }
        }
    }
    
    function removePagesFromSitemap(entity) {
        const entities = Array.from(getSitemapEntities())
        for(let current of entities) {
            if (entity.uri == current.uri) {
                removeFromSitemap(current)
            }
        }
    }
    
    function* getSitemapEntities() {
        const { sitemap } = mikser.state.layouts
        for (let href in sitemap) {
            let entry = sitemap[href]
            if (entry.id) {
                if (!entry.page || entry.page <= 1) {
                    yield entry
                }
            } else {
                for (let lang in entry) {
                    if (!entry[lang].page || entry[lang].page <= 1) {
                        yield entry[lang]
                    }
                }
            }
        }
    }
    
    onSync(collection, async ({ action, context }) => {
        if (!context.relativePath) return false
        const { relativePath } = context
        let id = path.join(`/${collection}`, relativePath)
        if (_.endsWith(id, '.js')) id = id.replace(new RegExp('.js$'), '')
    
        const uri = path.join(mikser.options.layoutsFolder, relativePath)
        const { layouts } = mikser.state.layouts
        switch (action) {
            case ACTION.CREATE:
                var layout = {
                    id, 
                    uri,
                    collection,
                    type,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    ...getFormatInfo(relativePath)
                }
                layouts[layout.name] = layout
                await createEntity(layout)
            break
            case ACTION.UPDATE:
                var layout = {
                    id,
                    uri,
                    collection,
                    type,
                    name: relativePath.replace(path.extname(relativePath), ''),
                    ...getFormatInfo(relativePath)
                }
                layouts[layout.name] = layout
                await updateEntity(layout)
            break
            case ACTION.DELETE:
                var layout = {
                    id,
                    collection,
                    type,
                    format: path.extname(relativePath).substring(1).toLowerCase(),
                }
                for (let name in layouts) {
                    if (layouts[name].id == layout.id) {
                        delete layouts[name]
                    }
                }
                await deleteEntity(layout)
            break
        }
    })
    
    onLoaded(async () => {
        const logger = useLogger()
        
        mikser.state.layouts = {
            layouts: {},
            sitemap: {}
        }
        
        mikser.options.layouts = mikser.config.layouts?.layoutsFolder || collection
        mikser.options.layoutsFolder = path.join(mikser.options.workingFolder, mikser.options.layouts)
        mikser.options.layoutsStateFolder = path.join(mikser.options.outputFolder, 'state')
    
        logger.info('Layouts folder: %s', mikser.options.layoutsFolder)
        await mkdir(mikser.options.layoutsFolder, { recursive: true })
        
        watch(collection, mikser.options.layoutsFolder)
    })
    
    onImport(async () => {
        const { layouts } = mikser.state.layouts
        const paths = await globby('**/*', { cwd: mikser.options.layoutsFolder, ignore: '**/*.js' })
        for (let relativePath of paths) {
            const uri = path.join(mikser.options.layoutsFolder, relativePath)
            const layout = {
                id: path.join('/layouts', relativePath),
                uri,
                name: relativePath.replace(path.extname(relativePath), ''),
                collection,
                type,
            }
            Object.assign(layout, await getFormatInfo(relativePath))
            layouts[layout.name] = layout
            await createEntity(layout)
        }
    })
    
    onProcessed(async () => {
        const logger = useLogger()
        const { layouts } = mikser.state.layouts
        
        for (let { entity, operation } of useJournal(OPERATION.CREATE, OPERATION.UPDATE, OPERATION.DELETE)) {
            if (entity.collection == collection) continue

            switch (operation) {
                case OPERATION.CREATE:
                case OPERATION.UPDATE:
                    removePagesFromSitemap(entity)
                    if (!entity.meta?.layout) {
                        for (let pattern in mikser.config.layouts?.match || []) {
                            if (minimatch(pattern, entity.name)) {
                                const layoutName = mikser.config.layouts?.match[pattern]
                                entity.layout = layouts[layoutName]
                                break
                            }
                        }
                        if (!entity.layout && mikser.config.layouts?.autoLayouts && entity.name) {
                            const nameChunks = path.basename(entity.name).split('.')
                            if (nameChunks?.length) {
                                for (let index = 0; index < nameChunks.length - 1; index++) {
                                    const autoLayout = path.basename(entity.name).split('.').slice(index).join('.')
                                    if (layouts[autoLayout]) {
                                        entity.layout = layouts[autoLayout]
                                        break
                                    }
                                }
                            }
                        }
                    } else {
                        entity.layout = layouts[entity.meta.layout]
                    }
            
                    if (entity.layout) {
                        logger.debug('Layout matched for %s: %s', entity.collection, entity.id)
                        addToSitemap(entity)
                    } else if (entity.meta?.href) {
                        logger.trace('Layout missing for %s: %s', entity.collection, entity.id)
                        addToSitemap(entity)
                    }
                break
                case OPERATION.DELETE:
                    removePagesFromSitemap(entity)
                break
            }

        }
    })
    
    onBeforeRender(async (signal) => {
        const entities = Array.from(getSitemapEntities())
        .filter(entity => entity.layout)
        .sort((a, b) => b.time - a.time)
    
        for (let original of entities) {
            if (signal.aborted) return
    
            delete original.page
            delete original.pages
            delete original.destination
    
            const entity = _.cloneDeep(original)
            entity.destination = '/' + entity.name
            let data
            try {
                var { load, plugins = [] } = await import(`${path.join(mikser.options.layoutsFolder, entity.layout.name)}.js?stamp=${Date.now()}`)
                if (load) {
                    data = await load(entity, signal)
                }
            } catch (err) {
                if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
            }  
    
            if (data?.pages) {
                if (!_.endsWith(entity.name, entity.format)) {
                    for (let page = 0; page < data.pages - 1; page++) {
                        const pageEntity = _.cloneDeep(entity)
                        pageEntity.pages = data.pages
                        if (page) {
                            pageEntity.page = page + 1
                            pageEntity.id = entity.id.replace(`.${entity.format}`, `.${pageEntity.page}.${entity.layout.format}`)
                            if (entity.meta) {
                                if (entity.meta.href) {
                                    pageEntity.meta.href = `${entity.meta.href}.${pageEntity.page}`
                                } else {
                                    pageEntity.meta.href = `/${entity.name}.${pageEntity.page}`
                                }
                            }
    
                            if (mikser.config.layouts?.cleanUrls && entity.layout.format == 'html') {
                                pageEntity.destination = path.join(entity.destination.replace('index', ''), pageEntity.page.toString(), `index.${entity.layout.format}`)
                            } else {
                                pageEntity.destination += page ? `.${pageEntity.page}.${entity.layout.format}` : `.${entity.layout.format}`
                            }
                        } else {
                            removePagesFromSitemap(original)
                            pageEntity.page = 1
                            if (mikser.config.layouts?.cleanUrls && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                                pageEntity.destination = path.join(entity.destination, `index.${entity.layout.format}`)
                            } else {
                                pageEntity.destination += `.${entity.layout.format}`
                            }
                        }
                        addToSitemap(pageEntity)
                        await renderEntity(pageEntity, { renderer: entity.layout.template }, { data, plugins })
                    }
                }
            } else {
                removePagesFromSitemap(original)
                if (!_.endsWith(entity.name, entity.format)) {
                    if (mikser.config.layouts?.cleanUrls && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                        entity.destination = path.join(entity.destination, `index.${entity.layout.format}`)
                    } else {
                        entity.destination += `.${entity.layout.format}`
                    }
                }
                addToSitemap(entity)
                if (entity.destination) {
                    await renderEntity(entity, { renderer: entity.layout.template }, { data, plugins })
                }
            }
        }
    })
    
    onAfterRender(async (signal) => {
        const logger = useLogger()
    
        for(let { result, entity } of useJournal(OPERATION.RENDER)) {
            if (signal.aborted) return
            if (result && entity.layout && entity.destination) {
                const destinationFile = path.join(mikser.options.outputFolder, entity.destination)
                await mkdir(path.dirname(destinationFile), { recursive: true })
                try {
                    await unlink(destinationFile)
                } catch {}
                await writeFile(destinationFile, result)
                logger.info('Render finished: %s', entity.destination.replace(mikser.options.workingFolder, ''))
            }
        }
    })

    return {
        collection,
        type
    }
}