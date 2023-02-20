import hasha from 'hasha'
import { stat } from 'node:fs/promises'
import TruncateStream from 'truncate-stream'
import { createReadStream } from 'node:fs'
import _ from 'lodash'
import minimatch from 'minimatch'

export async function checksum(uri) {
    const maxBytes = 300 * 1024
    const { size } = await stat(uri)
    if (size < maxBytes) {
        return await hasha.fromFile(uri, { algorithm: 'md5' })
    } else {
        const truncate = new TruncateStream({ maxBytes })
        const fileStream = createReadStream(uri)
        fileStream.pipe(truncate)
        const checksum = size.toString() + ':' + await hasha.fromStream(truncate, { algorithm: 'md5' })
        return checksum
    }
}

export function normalize(object) {
    return _.pickBy(
        object,
        (value, key) => {
            let pick = value !== undefined &&
            value !== '' &&
            value !== null &&
            key !== 'undefined' &&
            key !== '' &&
            key !== 'null' &&
            (typeof(value) != 'number' || !isNaN(value))
            return pick
        }
    )
}

export function matchEntity(entity, match) {
    if (typeof match == 'function') return match(entity)
    else if (typeof match == 'string') return minimatch(match, entity.id)
    else if (typeof match == 'object') return _.isMatch(entity, match)
    throw new Error('Ivalid match type')
}