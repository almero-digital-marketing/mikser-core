import sharp from 'sharp'

export const revision = 1
export const format = 'webp'
export const options = { 
    checksum: false,
}

export default ({ entity: { source, destination } }) => sharp(source)
.resize(320, 240, { fit: 'outside' })
.webp()
.toFile(destination)
