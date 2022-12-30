import { useLogger, useOperations, constants, onLoaded, mikser, onCancel, createEntity, onProcessed, onFinalize } from '../index.js'
import { mkdir, symlink, rename, unlink } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import lodash from 'lodash'
import deepdash from 'deepdash'
import axios from 'axios'
import isUrl from 'is-url'
import { AbortController } from 'abort-controller'
import path from 'node:path'
import { globby } from 'globby'
import hasha from 'hasha'
import { existsSync } from 'node:fs'

const _ = deepdash(lodash)
let abortController

onLoaded(async () => {
    const logger = useLogger()
	
	mikser.state.resources = {
		resourceMap: {}
	}

    mikser.options.resourcesFolder = mikser.config.resources?.resourcesFolder || path.join(mikser.options.workingFolder, 'resources')
    logger.info('Resources: %s', mikser.options.resourcesFolder)
    await mkdir(mikser.options.resourcesFolder, { recursive: true })

    for (let library in (mikser.config.resources?.libraries || [])) {
        let resource = mikser.config.resources.libraries[library]
        mikser.state.resources.resourceMap[resource.url] = library
    }
    
    const uri = path.join(mikser.options.outputFolder, 'resources')
    try {
        await mkdir(mikser.options.outputFolder, { recursive: true }) 
        await symlink(mikser.options.resourcesFolder, uri, 'dir')
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
    .filter(entity => entity.meta)

    for (let entity of entities) {      
        const resources = []
        _.eachDeep(entity.meta, value => {
            if (typeof value == 'string' && isUrl(value)) {
                for (let library in resourceMap) {
                    if (_.startsWith(value, library)) {
                        resources.push({ library, url: value })
                    }
                }
            }
        })
        for (let { library, url } of resources) {
            library = resourceMap[library]

            const { pathname } = new URL(url)
            const resource = path.join(mikser.options.resourcesFolder, library, pathname)
            const resourceTemp = path.join(mikser.options.resourcesFolder, library, pathname + '.temp')

            if (existsSync(resource)) continue

            logger.trace('Downloading resource: %s %s', entity.id, url)
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
                    logger.error(err, 'Resource error: %s %s', entity.id, url)
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

            const checksum = await hasha.fromFile(resource, { algorithm: 'md5' })

            await createEntity({
                id: path.join('/resources', library, pathname),
                uri: resource,
                collection: 'resources',
                type: 'resource',
                format: path.extname(resource).substring(1).toLowerCase(),
                name: path.join(library, pathname),
                source: url,
                checksum
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