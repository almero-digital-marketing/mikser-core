import { mikser, onLoaded, useLogger, onImport, createEntity, updateEntity, deleteEntity, watchEntities, onProcessed, onBeforeRender, useOperations, renderEntity, onAfterRender, constants, onSync } from '../index.js'
import path from 'path'
import { mkdir, writeFile, unlink } from 'fs/promises'
import { globby } from 'globby'
import _ from 'lodash'
import minimatch from 'minimatch'

let sitemap = {}
let layouts = {}

function getFormatInfo(relativePath) {
    const template = path.extname(relativePath).substring(1).toLowerCase()
    const format = path.extname(relativePath.replace(path.extname(relativePath),'')).substring(1).toLowerCase() || 'html'
    return { format, template }
}

function addToSitemap(entity) {
    const logger = useLogger()
    const { href = entity.name, lang } = entity.meta || {}
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
    for (let href in sitemap) {
        let entry = sitemap[href]
        if (entry.id == entity.id) {
            delete sitemap[href]
        } else {
            for (let lang in entry) {
                delete entry[lang]
            }
        }
    }
}

export function* getSitemapEntities() {
    for (let href in sitemap) {
        let entry = sitemap[href]
        if (entry.id) {
            yield entry
        } else {
            for (let lang in entry) {
                yield entry[lang]
            }
        }
    }
}

onSync(async ({ id, operation }) => {
    if (_.endsWith(id, '.js')) id = id.replace(new RegExp('.js$'), '')

    const relativePath = id.replace('/layouts/', '')
    const uri = path.join(mikser.options.layoutsFolder, relativePath)
    switch (operation) {
        case constants.OPERATION_CREATE:
            var layout = {
                id,
                uri,
                collection: 'layouts',
                type: 'layout',
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
                collection: 'layouts',
                type: 'layout',
                name: relativePath.replace(path.extname(relativePath), ''),
                ...getFormatInfo(relativePath)
            }
            layouts[layout.name] = layout
            await updateEntity(layout)
        break
        case constants.OPERATION_DELETE:
            var layout = {
                id,
                collection: 'layouts',
                type: 'layout',
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
    mikser.options.layoutsFolder = mikser.config.layouts?.folder || path.join(mikser.options.workingFolder, 'layouts')

    logger.info('Layouts: %s', mikser.options.layoutsFolder)
    await mkdir(mikser.options.layoutsFolder, { recursive: true })
    
    watchEntities('layouts', mikser.options.layoutsFolder)
})

onImport(async () => {
    const paths = await globby('**/*', { cwd: mikser.options.layoutsFolder, ignore: '**/*.js' })
    for (let relativePath of paths) {
        const uri = path.join(mikser.options.layoutsFolder, relativePath)
        const layout = {
            id: path.join('/layouts', relativePath),
            uri,
            name: relativePath.replace(path.extname(relativePath), ''),
            collection: 'layouts',
            type: 'layout',
            ...getFormatInfo(relativePath)
        }
        layouts[layout.name] = layout
        await createEntity(layout)
    }
})

onProcessed(async () => {
    const logger = useLogger()

    const entitiesToAdd = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.collection != 'layouts')

    for (let entity of entitiesToAdd) {
        if (!entity.meta?.layout) {
            for (let pattern in mikser.config.layouts?.match || []) {
                if (minimatch(pattern, entity.name)) {
                    entity.layout = mikser.config.layouts?.match[pattern]
                    break
                }
            }
            if (!entity.layout) {
                const autoLayout = entity.name?.split('.').slice(1).join('.')
                if (layouts[autoLayout]) {
                    entity.layout = layouts[autoLayout]
                } else {
                    continue
                }
            }
        } else {
            entity.layout = layouts[entity.meta.layout]
        }

        if (entity.layout) {
            logger.debug('Layout matched for %s: %s', entity.collection, entity.id)
            addToSitemap(entity)
        } else {
            logger.debug('Layout missing for %s: %s', entity.collection, entity.id)
        }
    }

    const entitiesToRemove = useOperations([constants.OPERATION_DELETE])
    .map(operation => operation.entity)
    .filter(entity => entity.collection != 'layouts')
    for (let entity of entitiesToRemove) { 
        removeFromSitemap(entity)
    }
})

onBeforeRender(async () => {
    let entities = getSitemapEntities()
    if (entities.length) mikser.cancel()
    for (let entity of entities) {
        entity.destination = '/' + entity.name
        try {
            var { load, plugins = [] } = await import(entity.layout.uri + '.js')
            if (load) {
                var data = await load({ mikser, entity })
            }
        } catch (err) {
            if (err.code != 'ERR_MODULE_NOT_FOUND') throw err
        }  

        if (data?.pages) {
            if (!_.endsWith(entity.name, entity.format)) {
                for (let page = 0; page < data.pages.length; page++) {
                    const pageEntity = _.cloneDeep(entity)
                    const pageData = _.clone(data)
                    pageData.page = page + 1
                    if (page) {
                        pageEntity.id = entity.id.replace(`.${entity.format}`, `.${pageData.page}.${entity.layout.format}`)
                        if (entity.meta?.href) {
                            pageEntity.meta.href = `${entity.meta.href}.${page}`
                        } 

                        if (mikser.config.layouts?.clean && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                            pageEntity.destination = path.join(entity.destination, pageData.page, `index.${entity.layout.format}`)
                        } else {
                            pageEntity.destination += page ? `.${pageData.page}.html` : `.${entity.layout.format}`
                        }
                    } else {
                        if (mikser.config.layouts?.clean && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                            pageEntity.destination = path.join(entity.destination, `index.${entity.layout.format}`)
                        } else {
                            pageEntity.destination += `.${entity.layout.format}`
                        }
                    }
                    await renderEntity(pageEntity, { data: pageData, sitemap, layouts, plugins })
                }
            }
        } else {
            if (!_.endsWith(entity.name, entity.format)) {
                if (mikser.config.layouts?.clean && !_.endsWith(entity.name, 'index') && entity.layout.format == 'html') {
                    entity.destination = path.join(entity.destination, `index.${entity.layout.format}`)
                } else {
                    entity.destination += `.${entity.layout.format}`
                }
            }
            await renderEntity(entity, { data, sitemap, layouts, plugins })
        }
    }
})

onAfterRender(async () => {
    const logger = useLogger()
    const entitiesToRender = useOperations(['render'])
    for(let { result, entity } of entitiesToRender) {
        if (result && entity.destination) {
            const destinationFile = path.join(mikser.options.outputFolder, entity.destination)
            await mkdir(path.dirname(destinationFile), { recursive: true })
            try {
                await unlink(destinationFile)
            } catch {}
            await writeFile(destinationFile, result)
            logger.info('Render finished: %s', entity.destination)
        }
    }
})

export {
    sitemap,
    layouts
}