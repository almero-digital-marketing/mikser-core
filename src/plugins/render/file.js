import { readFileSync } from 'fs'
import { globby } from 'globby'

export function load({ runtime }) {
    runtime.readFile = (file) => {
        const relativePath = file.name || file
        return readFileSync(relativePath, { encoding: 'utf8' })
    }
    runtime.glob = (pattern, options = {}) => {
        return globby.sync(pattern, options)
    }
}