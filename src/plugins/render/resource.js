export function load({ runtime, state, options }) {
    runtime.resource = (url) => {
        const { resourceMap } = state.resources
        for (let library in resourceMap) {
            if (url.match(library)) {
                const { origin } = new URL(url)
                const name = url.replace(origin, `${resourceMap[library]}/`)
                const link = url.replace(origin, `/${options.resources}/${resourceMap[library]}/`)
                return { link, name }
            }
        }
    }
}