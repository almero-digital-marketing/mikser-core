import { useLogger, onLoaded, mikser, } from '../index.js'
import { mkdir, symlink, stat } from 'node:fs/promises'

import path from 'node:path'

onLoaded(async () => {
    const logger = useLogger()

    for (let item of (mikser.config.shares?.locations || [])) {
        let source, destination
        if (typeof item == 'string') {
            source = destination = item
        } else {
            source = item.source
            destination = item.destination
        }

        let destinationLocation = path.join(mikser.options.outputFolder, destination)
        let destinationFolder = path.dirname(destinationLocation)
        try {
            const sourceLocation = path.join(mikser.options.workingFolder, source)
            const sourceStat = await stat(sourceLocation)

            await mkdir(destinationFolder, { recursive: true })
            logger.info('Sharing: %s → %s', sourceLocation, destinationLocation)
            if (sourceStat.isDirectory()) {
                await symlink(sourceLocation, destinationLocation, 'dir')
            } else {
                await symlink(sourceLocation, destinationLocation, 'file')
            }
        } catch (err) {
            if (err.code != 'EEXIST')
            throw err
        }
    }
})