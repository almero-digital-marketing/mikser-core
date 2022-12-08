import handlebars from 'handlebars'
import helpers from 'handlebars-helpers'
import { readFile } from 'fs/promises'

handlebars.registerHelper(helpers([
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

export async function render({ entity, config, context }) {
    for (let partial in context.layouts) {
        if (context.layouts[partial].tempalte == 'hbs' && partial.indexOf('partials') == 0) {
            const partialLayout = readFile(context.layouts[partial].uri, 'utf8')
            handlebars.registerPartial(partial, partialLayout)
        }
    }
    const layout = await readFile(entity.layout.uri, 'utf8')
    const tempalte = handlebars.compile(layout)
    return tempalte({
        ...entity.meta,
        source: entity.source,
        plugins: context.plugins,
        config: config.hbs,
        data: context.data
    })
}