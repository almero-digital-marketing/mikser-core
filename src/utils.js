import hasha from 'hasha'
import { stat } from 'node:fs/promises'
import TruncateStream from 'truncate-stream'
import { createReadStream } from 'node:fs'
import _ from 'lodash'
import { minimatch } from 'minimatch'
import path from 'path'

export class AbortError extends Error {
	constructor(message) {
		super();
		this.name = 'AbortError';
		this.message = message;
	}
}

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
    if (!match) return false
    if (typeof match == 'function') return match(entity)
    else if (typeof match == 'string') {
        if (match.substring(0,1) == '@/') {
            return minimatch(entity.name, match.substring(2))
        } else {
            return minimatch(entity.id, match)
        }
    }
    else if (typeof match == 'object') return _.isMatch(entity, match)
    throw new Error('Ivalid match type')
}

export function changeExtension(file, format) {
    let extension = path.extname(file)
    let result = file.substring(0, file.length - extension.length) +  '.' + format
    return result
}