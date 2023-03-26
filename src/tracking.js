import cliProgress from 'cli-progress'
import mikser from './mikser.js'
import { useLogger } from './runtime.js'
import formatTime from 'cli-progress/lib/format-time.js'
import { onInitialized } from './lifecycle.js'

let progress = {}

function log(log) {
    const { bar, total, value, name } = progress
    const isActive = bar?.isActive
    isActive && bar?.stop()
    log()
    isActive && bar?.start(total, value, { name })
}

onInitialized(() => {
    const logger = useLogger()
    if (mikser.options.info) {
        logger.info = (...args) => log(() => console.log(...args))
        logger.warn = (...args) => log(() => console.log('⚠️ ' + args[0], ...args.slice(1)))
        logger.error = (...args) => log(() => console.log('❌ ' + args[0], ...args.slice(1)))
        logger.notice = (...args) => log(() => console.log('✅ ' + args[0], ...args.slice(1)))
    }
})

export function trackProgress(name, total) {
    const logger = useLogger()
    logger.debug('%s started: %d', name, total)
    progress.bar?.stop()
    progress = {
        name,
        total,
        value: 0,
        stamp: Date.now(),
        bar: mikser.options.info && new cliProgress.SingleBar({
            noTTYOutput: true,
            hideCursor: true,
            clearOnComplete: true,
            barsize: 40,
            format: '{name}: {bar} {percentage}% | ETA: {eta_formatted}',
        }, cliProgress.Presets.shades_grey)
    }
    progress.bar?.start(total, 0, { name })
}

export function stopProgress() {
    const logger = useLogger()
    const { value, total, bar, name } = progress
    bar?.stop()
    if (value < total) {
        logger.warn('%s unfinished: %d', name, total - value)
    } else {
        const time = Math.round((Date.now() - progress.stamp) / 1000)
        logger.info('%s: %s', name, formatTime(time, { autopaddingChar: '' }))
    }
    progress = {}
}

export function updateProgress() {
    progress.name && progress.value++
    progress.bar?.increment()
    if (progress?.value == progress?.total) {
        stopProgress()
    }
}