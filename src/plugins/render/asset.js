export function load({ runtime, state }) {
    runtime.asset = (preset, url, format) => {
        if (url[0] != '/') url = `/${url}`
        return `/${state.assets.assetsFolder}/${preset}${format ? url.split('.').slice(0, -1).concat(format).join('.') : url}`
    }
}