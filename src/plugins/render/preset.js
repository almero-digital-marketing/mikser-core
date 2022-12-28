export async function load({ entity, runtime }) {
    const preset = await import(`${entity.preset.uri}?v=${Date.now()}`)
    runtime.preset = preset.default
}

export async function render({ entity, options, config, context, plugins, runtime }) {
    await runtime.preset({ entity, options, config, context, plugins, runtime })
    return entity.destination
}