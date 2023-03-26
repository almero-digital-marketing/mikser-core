import { mkdir, symlink, rename, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import lodash from 'lodash'
import deepdash from 'deepdash'
import axios from 'axios'
import { AbortController } from 'abort-controller'
import path from 'node:path'
import { globby } from 'globby'
import escapeStringRegexp from 'escape-string-regexp'
import * as stream from 'stream'
import { promisify } from 'util'
import isUrl from 'is-url'
import pMap from 'p-map'

export default ({ 
    useLogger, 
    useJournal, 
    onLoaded, 
    mikser, 
    onCancel, 
    createEntity, 
    onProcessed, 
    onFinalize, 
    checksum,
    trackProgress,
    updateProgress,
    constants: { OPERATION }, 
}) => {
    const collection = 'resources'
    const type = 'resource'

    const _ = deepdash(lodash)
    let abortController
    
    const finishedDownload = promisify(stream.finished)
    
    onLoaded(async () => {
        const logger = useLogger()
        
        mikser.state.resources = {
            resourceMap: {}
        }
    
        mikser.options.resources = mikser.config.resources?.resourcesFolder || collection
        mikser.options.resourcesFolder = path.join(mikser.options.workingFolder, mikser.options.resources)
        logger.info('Resources folder: %s', mikser.options.resourcesFolder)

        for (let library in (mikser.config.resources?.libraries || [])) {
            let resource = mikser.config.resources.libraries[library]
            mikser.state.resources.resourceMap[resource.match || escapeStringRegexp(resource.url)] = library
        }
    })
    
    onProcessed(async () => {
        const logger = useLogger()
        const { resourceMap } = mikser.state.resources
        abortController = new AbortController()
        const { signal } = abortController
    
        const resources = []
        for await (let { entity } of useJournal('Resources provision', [OPERATION.CREATE, OPERATION.UPDATE])) {    
            if (entity.collection != collection && entity.meta) {
                _.eachDeep(entity.meta, resource => {
                    if (typeof resource == 'string') {
                        for (let library in resourceMap) {
                            const match = new RegExp(library)
                            if (resource.match(match)) {
                                resources.push({ library, resource, entity })
                            }
                        }
                    }
                })
            }
        }
        resources.length && logger.info('Resources: %d', resources.length)
        
        const resourceDownloads = {}
        const localResources = new Set()
        trackProgress('Resources processing', resources.length)
        for (let { library, resource, entity } of resources) {
            library = resourceMap[library]
            if (isUrl(resource)) {
                if (!resourceDownloads[resource]) {
                    resourceDownloads[resource] = { library, entity }
                }
            } else {
                try {
                    const id = resource.indexOf(`/${library}`) == 0 ? resource : path.join(`/${library}`, resource)
                    if (!localResources.has(id)) {
                        await createEntity({
                            id,
                            uri: path.join(mikser.options.workingFolder, resource),
                            collection,
                            type,
                            format: path.extname(resource).substring(1).toLowerCase(),
                            name: resource.indexOf('/') == 0 ? resource.substring(1) : resource,
                            source: path.join(mikser.options.workingFolder, resource),
                            checksum: await checksum(path.join(mikser.options.workingFolder, resource))
                        })
                        logger.info('Resource: %s %s', id, resource)
                        localResources.add(id)
                    }
                } catch (err) {
                    logger.error('Resource error: %s %s %s', entity.id, resource, err.message)
                }
            }
            updateProgress()
        }
    
        const resourceFiles = await globby('**/*', { cwd: mikser.options.resourcesFolder })
        const resourceFilesMap = new Set()
        for (let resourceFile of resourceFiles) {
            resourceFilesMap.add(resourceFile)
        }

        const downloads = Object.keys(resourceDownloads)
        if (downloads.length) {
            trackProgress('Resources download', downloads.length)
            await mkdir(mikser.options.resourcesFolder, { recursive: true })
            let link = path.join(mikser.options.outputFolder, mikser.options.resources)
            if (mikser.config.resources?.outputFolder) link = path.join(mikser.options.outputFolder, mikser.config.resources?.outputFolder, mikser.options.resources)
            try {
                await mkdir(path.dirname(link), { recursive: true }) 
                await symlink(mikser.options.resourcesFolder, link, 'dir')
            } catch (err) {
                if (err.code != 'EEXIST')
                throw err
            }
            let count = 0
            await pMap(downloads, async url => {
                const { library, entity } = resourceDownloads[url]
                let { pathname } = new URL(url)
                pathname = decodeURI(pathname)
                const resource = path.join(mikser.options.resourcesFolder, library, pathname)
                const uri = path.join(mikser.options.outputFolder, library, pathname)
        
                let success = true
                if (!resourceFilesMap.has(path.join(library, pathname))) {
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
                        count++
                        var response = await axios(request)
                    } catch (err) {
                        success == false
                        if (axios.isCancel(err)) {
                            logger.trace('Downloading canceled')
                        } else {
                            logger.error('Resource error: %s %s %s', entity.id, url, err.message)
                        }
                        return
                    }
        
                    if (response && success) {
                        await mkdir(path.dirname(resource), { recursive: true })
                        const writer = createWriteStream(resourceTemp)
                        response.data.pipe(writer)
                        await finishedDownload(writer)
            
                        logger.info('Resource: %s %s', entity.id, url)
                        await rename(resourceTemp, resource)
                    }
                }
                
                if (success) {
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
                updateProgress()
            }, { concurrency: 10 })
            count && logger.info('Downloaded: %d', count)
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

    return {
        collection,
        type
    }
}