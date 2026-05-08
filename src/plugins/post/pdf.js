import { mkdir } from 'fs/promises'
import path from 'node:path'

export async function postprocess({ entity, options, config, logger }) {
    let puppeteer
    try {
        puppeteer = (await import('puppeteer')).default
    } catch {
        throw new Error('puppeteer is required for the pdf postprocessor — run: npm install puppeteer')
    }

    const sourcePath = path.join(options.outputFolder, entity.destination)
    const destinationPath = sourcePath.replace(/\.html?$/i, '.pdf')

    await mkdir(path.dirname(destinationPath), { recursive: true })

    const browser = await puppeteer.launch({
        headless: true,
        ...config?.launch
    })
    try {
        const page = await browser.newPage()
        await page.goto(`file://${sourcePath}`, {
            waitUntil: 'networkidle0',
            ...config?.navigation
        })
        await page.pdf({
            path: destinationPath,
            format: 'A4',
            printBackground: true,
            ...config?.pdf
        })
        logger.debug('PDF generated: %s', destinationPath)
    } finally {
        await browser.close()
    }
}
