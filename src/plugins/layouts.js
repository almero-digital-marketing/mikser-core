import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watch, onProcessed, onBeforeRender, useOperations, renderEntity, onAfterRender, constants, onSync } from '../../index.js'
import path from 'node:path'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import minimatch from 'minimatch'

export const collection = 'layouts'
export const type = 'layout'

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
            logger.warn('Entity with equal href: %s and %s', previous.collection, previous.id, entity.id);
        }
        sitemap[href][lang] = entity
    }
    else {
        let previous = sitemap[href];
        if (previous && (previous.id != entity.id)) {
            logger.warn('Entity with equal href: %s and %s', previous.collection, previous.id, entity.id);
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

onSync(async ({ operation, context: { relativePath } }) => {
    if (!relativePath) return false
    let id = path.join(`/${collection}`, relativePath)
    if (_.endsWith(id, '.js')) id = id.replace(new RegExp('.js$'), '')

    const uri = path.join(mikser.options.layoutsFolder, relativePath)
	const { layouts } = mikser.state.layouts
    switch (operation) {
        case constants.OPERATION_CREATE:
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
        case constants.OPERATION_UPDATE:
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
        case constants.OPERATION_DELETE:
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
}, collection)

onLoaded(async () => {
    const logger = useLogger()
	
	mikser.state.layouts = {
		layouts: {},
		sitemap: {}
	}
	
    mikser.options.layouts = mikser.config.layouts?.layoutsFolder || collection
    mikser.options.layoutsFolder = path.join(mikser.options.workingFolder, mikser.options.layouts)

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
    
    const entitiesToAdd = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.collection != collection)
    for (let entity of entitiesToAdd) {
        removePagesFromSitemap(entity)
        if (!entity.meta?.layout) {
            for (let pattern in mikser.config.layouts?.match || []) {
                if (minimatch(pattern, entity.name)) {
                    const layoutName = mikser.config.layouts?.match[pattern]
                    entity.layout = layouts[layoutName]
                    break
                }
            }
            if (!entity.layout &&  mikser.config.layouts?.autoLayouts) {
                const nameChunks = entity.name?.split('.')
                if (nameChunks?.length) {
                    for (let index = 0; index < nameChunks.length - 1; index++) {
                        const autoLayout = entity.name?.split('.').slice(index).join('.')
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
        } else {
            logger.trace('Layout missing for %s: %s', entity.collection, entity.id)
        }
    }

    const entitiesToRemove = useOperations([constants.OPERATION_DELETE])
    .map(operation => operation.entity)
    .filter(entity => entity.collection != collection)
    for (let entity of entitiesToRemove) { 
        removePagesFromSitemap(entity)
    }
})

onBeforeRender(async () => {
    const entities = Array.from(getSitemapEntities()).sort((a, b) => b.time - a.time)

    for (let original of entities) {
        delete original.page
        delete original.pages
        delete original.destination

        const entity = _.cloneDeep(original)
        entity.destination = '/' + entity.name
        let data
        try {
            var { load, plugins = [] } = await import(`${path.join(mikser.options.layoutsFolder, entity.layout.name)}.js?stamp=${Date.now()}`)
            if (load) {
                data = await load(entity)
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
                    await renderEntity(pageEntity, entity.layout.template, { data, plugins })
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
            await renderEntity(entity, entity.layout.template, { data, plugins })
        }
    }
})

onAfterRender(async () => {
    const logger = useLogger()

    const entitiesToRender = useOperations(['render'])
    for(let { result, entity } of entitiesToRender) {
        if (result && entity.layout) {
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