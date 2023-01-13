import hasha from 'hasha'
import { stat } from 'node:fs/promises'
import TruncateStream from 'truncate-stream'
import { createReadStream } from 'node:fs'
import _ from 'lodash'

const maxBytes = 300 * 1024

export async function checksum(uri) {
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
