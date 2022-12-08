import { execaCommand } from 'execa'
import lineReader from 'line-reader'
import { promisify } from 'util'

import { 
    mikser,
    useLogger,
    onLoad,
    onLoaded,
    onImport,
    onImported,
    onProcess,
    onProcessed,
    onPersist,
    onPersisted,
    onCancel,
    onCancelled,
    onBeforeRender,
    onRender,
    onAfterRender,
} from '../index.js'

const eachLine = promisify(lineReader.eachLine)

export async function executeCommand(command) {
    const logger = useLogger()
    logger.info('Command: %s', command, mikser.options.wokrkingFolder)
    const subprocess = execaCommand(command, { cwd: mikser.options.wokrkingFolder, all: true })
    await eachLine(subprocess.all, line => logger.debug(line))
    await subprocess
}

async function executeCommands(hook) {
    let commands = mikser.config.commands && mikser.config.commands[hook] || []
    if (typeof commands == 'function') commands = await commands()
    if (typeof commands == 'string') commands = [commands]

    for(let command of commands) {
        await executeCommand(command)
    }
}

onLoad(async () => await executeCommands('load'))
onLoaded(async () => await executeCommands('loaded'))
onImport(async () => await executeCommands('import'))
onImported(async () => await executeCommands('imported'))
onProcess(async () => await executeCommands('process'))
onProcessed(async () => await executeCommands('processed'))
onPersist(async () => await executeCommands('persist'))
onPersisted(async () => await executeCommands('persisted'))
onBeforeRender(async () => await executeCommands('beforeRender'))
onRender(async () => await executeCommands('render'))
onAfterRender(async () => await executeCommands('afterRender'))
onCancel(async () => await executeCommands('cancel'))
onCancelled(async () => await executeCommands('canceled'))