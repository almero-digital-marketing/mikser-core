export function load({ runtime, state, options }) {
    runtime.resource = (url) => {
        const { resourceMap } = state.resources
        for (let library in resourceMap) {
            if (url?.indexOf(library) == 0) {
                const name = url.replace(library, `${resourceMap[library]}/`)
                const link = url.replace(library, `/${options.resources}/${resourceMap[library]}/`)
                return { link, name }
            }
        }
    }
}