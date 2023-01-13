import { useLogger, useOperations, constants, onLoaded, mikser, onCancel, createEntity, onProcessed, onFinalize, checksum } from '../../index.js'
import { mkdir, symlink, rename, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import lodash from 'lodash'
import deepdash from 'deepdash'
import axios from 'axios'
import isUrl from 'is-url'
import { AbortController } from 'abort-controller'
import path from 'node:path'
import { globby } from 'globby'
import { existsSync } from 'node:fs'

export const collection = 'resources'
export const type = 'resource'

const _ = deepdash(lodash)
let abortController

onLoaded(async () => {
    const logger = useLogger()
	
	mikser.state.resources = {
		resourceMap: {}
	}

    mikser.options.resources = mikser.config.resources?.resources || collection
    mikser.options.resourcesFolder = path.join(mikser.options.workingFolder, mikser.options.resources)
    logger.info('Resources folder: %s', mikser.options.resourcesFolder)
    await mkdir(mikser.options.resourcesFolder, { recursive: true })

    for (let library in (mikser.config.resources?.libraries || [])) {
        let resource = mikser.config.resources.libraries[library]
        mikser.state.resources.resourceMap[resource.url] = library
    }
    
    let link = path.join(mikser.options.outputFolder, mikser.options.resources)
    if (mikser.config.resources?.output) link = path.join(mikser.options.outputFolder, mikser.config.resources?.output, mikser.options.resources)
    try {
        await mkdir(path.dirname(link), { recursive: true }) 
        await symlink(mikser.options.resourcesFolder, link, 'dir')
    } catch (err) {
        if (err.code != 'EEXIST')
        throw err
    }
})

onProcessed(async () => {
    const logger = useLogger()
    const { resourceMap } = mikser.state.resources
	abortController = new AbortController()
    const { signal } = abortController

    const entities = useOperations([constants.OPERATION_CREATE, constants.OPERATION_UPDATE])
    .map(operation => operation.entity)
    .filter(entity => entity.collection != collection && entity.meta)

    const resources = []
    for (let entity of entities) {      
        _.eachDeep(entity.meta, value => {
            if (typeof value == 'string' && isUrl(value)) {
                for (let library in resourceMap) {
                    if (_.startsWith(value, library)) {
                        resources.push({ library, url: value, entity })
                    }
                }
            }
        })
    }
    
    const resourceDownloads = {}
    logger.info('Processing resources: %d', resources.length)
    for (let { library, url, entity } of resources) {
        library = resourceMap[library]

        const { pathname } = new URL(url)
        const resource = path.join(mikser.options.resourcesFolder, library, pathname)
        const uri = path.join(mikser.options.outputFolder, library, pathname)
    
        if (!resourceDownloads[url]) {
            resourceDownloads[url] = true

            if (!existsSync(resource)) {
                const resourceTemp = path.join(mikser.options.resourcesFolder, library, pathname + '.temp')
                logger.debug('Downloading resource: %s %s', entity.id, url)
                const config = mikser.config.resources.libraries[library]
                const request = {
                    method: 'get',
                    ...config,
                    url,
                    responseType: 'stream',
                    signal
                }
    
                try {
                    var response = await axios(request)
                } catch (err) {
                    if (axios.isCancel(err)) {
                        logger.trace('Downloading canceled')
                        return
                    } else {
                        logger.error('Resource error: %s %s %s', entity.id, url, err.message)
                        continue
                    }
                }
    
                await mkdir(path.dirname(resource), { recursive: true })
                await new Promise((resolve, reject) => {
                    const writer = createWriteStream(resourceTemp)
                    writer.on('finish', resolve)
                    writer.on('error', reject)
                    response.data.pipe(writer)
                })
    
                logger.info('Resource: %s %s', entity.id, url)
                await rename(resourceTemp, resource)
            }
            
            await createEntity({
                id: path.join('/resources', library, pathname),
                uri,
                collection,
                type,
                format: path.extname(resource).substring(1).toLowerCase(),
                name: path.join(library, pathname),
                source: resource,
                checksum: await checksum(resource)
            })
        }
    }
})

onFinalize(async () => {
    const paths = await globby('**/*.temp', { cwd: mikser.options.resourcesFolder })
    for (let relativePath of paths) {
        let resourceTemp = path.join(mikser.options.resourcesFolder, relativePath)
        await unlink(resourceTemp)
    }
})

onCancel(() => {
    abortController?.abort()
})