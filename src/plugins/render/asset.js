export function load({ runtime, state }) {
    runtime.asset = (preset, url) => {
        if (url[0] != '/') url = `/${url}`
        return `/assets/${preset}${url}`
    }
}