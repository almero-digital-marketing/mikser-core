import handlebars from 'handlebars'
import helpers from 'handlebars-helpers'
import { readFile } from 'fs/promises'

export function load({ config, runtime, context }) {
    handlebars.registerHelper(helpers(config?.helpers || [
        'array', 
        'collection',
        'object', 
        'comparison', 
        'date', 
        'markdown', 
        'match', 
        'math', 
        'number', 
        'regex', 
        'string', 
        'url'
    ]))
    for (let partial in context.layouts) {
        if (context.layouts[partial].tempalte == 'hbs' && partial.indexOf('partials') == 0) {
            const partialLayout = readFile(context.layouts[partial].uri, 'utf8')
            handlebars.registerPartial(partial, partialLayout)
        }
    }
    runtime.hbs = (source, sandbox) => {
        const tempalte = handlebars.compile(source)
        return tempalte(sandbox)
    }
}

export async function render({ entity, runtime }) {
    const sandbox = {}
    for (let helper in runtime) {
        if (typeof(runtime[helper]) == 'function') {
            handlebars.registerHelper(helper, runtime[helper])
        } else {
            sandbox[helper] = runtime[helper]
        }
    }
    const source = await readFile(entity.layout.uri, 'utf8')
    const result = runtime.hbs(source, sandbox)
    return result
}