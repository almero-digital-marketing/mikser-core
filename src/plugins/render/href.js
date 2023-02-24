export function load({ entity, runtime, state }) {
    runtime.hrefLang = (href, page) => {
        const { sitemap } = state.layouts
        if (page > 1) href += `.${page}`
        return sitemap[href]
    }

    runtime.href = (href, page, lang) => {
        if (typeof page == 'string' && !lang) {
            lang = page
            page = undefined
        }
        lang ||= entity.meta?.lang
        
        if (!href) return
        if (typeof href == 'object') return href
        if (href.indexOf('http') == 0) return href

        let found = runtime.hrefLang(href, page)
        if (!found) {
            return { link: href }
        } else {
            if (!found.id) {
                found = found[lang]
            }
            if (found) {
                found.link = found.destination.replace('index.html', '')
            }
            return found
        }
    }

    runtime.prev = entity.page > 1 ? entity.page - 1 : false
    runtime.next = entity.page + 1 < entity.pages ? entity.page + 1 : false
}