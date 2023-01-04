export function load({ runtime, options }) {
    runtime.asset = (preset, url) => {
        if (url[0] != '/') url = `/${url}`
        return `/${options.assets}/${preset}${url}`
    }
}