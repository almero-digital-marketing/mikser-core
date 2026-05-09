import { mkdir, writeFile } from 'fs/promises'
import path from 'node:path'

let browser

export async function setup({ config, logger }) {
    const { default: puppeteer } = await import('puppeteer').catch(() => {
        throw new Error('puppeteer is required for the pdf postprocessor — run: npm install puppeteer')
    })
    browser = await puppeteer.launch({
        headless: true,
        ...config?.launch
    })
    logger.debug('Puppeteer browser launched')
}

export async function postprocess({ entity, options, config, logger }) {
    const sourcePath = path.join(options.outputFolder, entity.destination)
    const destinationPath = sourcePath.replace(/\.html?$/i, '.pdf')

    await mkdir(path.dirname(destinationPath), { recursive: true })

    const page = await browser.newPage()
    try {
        await page.goto(`file://${sourcePath}`, {
            waitUntil: 'networkidle0',
            ...config?.navigation
        })
        const buffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            ...config?.pdf
        })
        await writeFile(destinationPath, buffer)
        logger.debug('PDF generated: %s', destinationPath)
    } finally {
        await page.close()
    }
}

export async function teardown({ logger }) {
    await browser?.close()
    browser = undefined
    logger.debug('Puppeteer browser closed')
}
