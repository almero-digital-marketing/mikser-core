import path from 'node:path'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
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
    onProcessed,
    onBeforeRender,
    useJournal,
    renderEntities,
    onComplete,
    onSync,
    matchEntity,
    changeExtension,
    constants: { ACTION, OPERATION, TASKS },
}) => {
    const collection = 'layouts'
    const type = 'layout'

    function getFormatInfo(relativePath) {
        const template = path.extname(relativePath).substring(1).toLowerCase()
        const withoutTemplate = relativePath.replace(path.extname(relativePath), '')
        const formatExt = path.extname(withoutTemplate).substring(1).toLowerCase()
        const [format, postprocessor] = formatExt.split('-')
        const name = formatExt ? withoutTemplate.replace(path.extname(withoutTemplate), '') : withoutTemplate
        return { name, format: format || 'html', template, postprocessor }
    }

    function addToSitemap(entity) {
        const logger = useLogger()
        const { sitemap } = runtime.state.layouts
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
        const { sitemap } = runtime.state.layouts
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
        for (let current of entities) {
            if (entity.uri == current.uri) {
                removeFromSitemap(current)
            }
        }
    }

    function* getSitemapEntities() {
        const { sitemap } = runtime.state.layouts
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

        const uri = path.join(runtime.options.layoutsFolder, relativePath)
        const { layouts } = runtime.state.layouts
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

        runtime.state.layouts = {
            layouts: {},
            sitemap: {}
        }

        runtime.options.layouts = runtime.config.layouts?.layoutsFolder || collection
        runtime.options.layoutsFolder = path.join(runtime.options.workingFolder, runtime.options.layouts)
        runtime.options.layoutsStateFolder = path.join(runtime.options.outputFolder, 'state')

        logger.info('Layouts folder: %s', runtime.options.layoutsFolder)
        await mkdir(runtime.options.layoutsFolder, { recursive: true })

        watch(collection, runtime.options.layoutsFolder)
    })

    onImport(async () => {
        const { layouts } = runtime.state.layouts
        const paths = await globby('**/*', { cwd: runtime.options.layoutsFolder, ignore: ['**/*.js'] })
        for (let relativePath of paths) {
            const uri = path.join(runtime.options.layoutsFolder, relativePath)
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

    onProcessed(async (signal) => {
        const logger = useLogger()
        const { layouts } = runtime.state.layouts

        for await (let { entity, operation } of useJournal('Layouts processing', [OPERATION.CREATE, OPERATION.UPDATE, OPERATION.DELETE], signal)) {
            if (entity.collection == collection) continue
            switch (operation) {
                case OPERATION.CREATE:
                case OPERATION.UPDATE:
                    removePagesFromSitemap(entity)
                    if (!entity.meta?.layout) {
                        for (let pattern in runtime.config.layouts?.match || []) {
                            if (matchEntity(entity, pattern)) {
                                const layoutName = runtime.config.layouts?.match[pattern]
                                entity.layout = layouts[layoutName]
                                break
                            }
                        }
                        if (!entity.layout && runtime.config.layouts?.autoLayouts && entity.name) {
                            const nameChunks = entity.name.split('.')
                            if (nameChunks?.length) {
                                for (let index = 0; index < nameChunks.length; index++) {
                                    const autoLayout = [
                                        path.basename(entity.name).split('.').slice(index).join('.'),
                                        path.basename(entity.id)
                                    ]
                                        .find(layout => layouts[layout])
                                    if (autoLayout) {
                                        entity.layout = layouts[autoLayout]
                                        break
                                    }
                                }
                            }
                        }
                    } else {
                        entity.layout = layouts[entity.meta.layout]
                    }
                    if (entity.meta?.layout && !entity.layout) {
                        logger.warn('Layout not found for %s: %s', entity.collection, entity.id)
                    }

                    if (entity.layout && entity.meta?.postprocessor) {
                        entity.layout.postprocessor = entity.meta.postprocessor
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
        const tasks = []
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
                var { load, plugins = [] } = await import(`${path.join(runtime.options.layoutsFolder, entity.layout.name)}.js?stamp=${Date.now()}`)
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
                            pageEntity.id = changeExtension(entity.id, `${pageEntity.page}.${entity.layout.format}`)
                            if (entity.meta) {
                                if (entity.meta.href) {
                                    pageEntity.meta.href = `${entity.meta.href}.${pageEntity.page}`
                                } else {
                                    pageEntity.meta.href = `/${entity.name}.${pageEntity.page}`
                                }
                            }

                            if (runtime.config.layouts?.cleanUrls && entity.layout.format == 'html') {
                                pageEntity.destination = path.join(entity.destination.replace('index', ''), pageEntity.page.toString(), `index.${entity.layout.format}`)
                            } else {
                                pageEntity.destination += page ? `.${pageEntity.page}.${entity.layout.format}` : `.${entity.layout.format}`
                            }
                        } else {
                            removePagesFromSitemap(original)
                            pageEntity.page = 1
                            if (runtime.config.layouts?.cleanUrls && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                                pageEntity.destination = path.join(entity.destination, `index.${entity.layout.format}`)
                            } else {
                                pageEntity.destination += `.${entity.layout.format}`
                            }
                        }
                        addToSitemap(pageEntity)
                        tasks.push({
                            entity: pageEntity,
                            options: {
                                renderer: entity.layout.template,
                                postprocessor: entity.layout.postprocessor,
                                tasks: entity.meta?.task || TASKS.POOL
                            },
                            context: { data, plugins }
                        })
                    }
                }
            } else {
                removePagesFromSitemap(original)
                if (!_.endsWith(entity.name, entity.format)) {
                    if (runtime.config.layouts?.cleanUrls && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                        entity.destination = path.join(entity.destination, `index.${entity.layout.format}`)
                    } else {
                        entity.destination += `.${entity.layout.format}`
                    }
                }
                addToSitemap(entity)
                if (entity.destination) {
                    tasks.push({
                        entity,
                        options: {
                            renderer: entity.layout.template,
                            postprocessor: entity.layout.postprocessor,
                            tasks: entity.meta?.task || TASKS.POOL
                        },
                        context: { data, plugins }
                    })
                }
            }
        }
        await renderEntities(tasks)
    })

    onComplete(async ({ entity, options, output }) => {
        const logger = useLogger()
        if (entity.layout && !options?.ignore && output.result != null) {
            const destinationFile = path.join(runtime.options.outputFolder, entity.destination)
            await mkdir(path.dirname(destinationFile), { recursive: true })
            try {
                await unlink(destinationFile)
            } catch { }
            await writeFile(destinationFile, output.result)
            logger.debug('Layout render finished: %s', entity.destination.replace(runtime.options.workingFolder, ''))
            if (entity.origin) {
                const originFile = path.join(runtime.options.outputFolder, entity.origin)
                try {
                    await unlink(originFile)
                } catch { }
            }
        }
    })

    return {
        collection,
        type
    }
}