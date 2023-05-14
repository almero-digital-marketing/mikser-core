export function load({ runtime, state }) {
    runtime.resource = (url) => {
        const { resourceLib } = state.resources
        for (let library in resourceLib) {
            if (url.match(library)) {
                const { origin } = new URL(url)
                const name = url.replace(origin, `${resourceLib[library]}/`)
                const link = url.replace(origin, `/${state.resources.resourcesFolder}/${resourceLib[library]}/`)
                return { link, name }
            }
        }
    }
}