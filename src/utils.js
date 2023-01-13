import hasha from 'hasha'
import { stat } from 'node:fs/promises'
import TruncateStream from 'truncate-stream'
import { createReadStream } from 'node:fs'

const maxBytes = 300 * 1024

export async function checksum(uri) {
    const { size } = await stat(uri)
    if (size < maxBytes) {
        return await hasha.fromFile(uri)
    } else {
        const truncate = new TruncateStream({ maxBytes })
        const fileStream = createReadStream(uri)
        fileStream.pipe(truncate)
        const checksum = size.toString() + ':' + await hasha.fromStream(truncate, {algorithm: 'md5'})
        return checksum
    }
}