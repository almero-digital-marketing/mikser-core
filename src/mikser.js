export default class {
    static stamp = Date.now()
    static processTime
    static runtime = {}
    static options = {
        plugins: []
    }
    static config = {}
    static journal = []
    static hooks = {
        initialize: [],
        initialized: [],
        load: [],
        loaded: [],
        import: [],
        imported: [],
        process: [],
        processed: [],
        persist: [],
        persisted: [],
        beforeRender: [],
        render: [],
        afterRender: [],
        cancel: [],
        cancelled: [],
        finalize: [],
        finalized: [],
        sync: [],
    }
    static async start() {
        for(let hook of this.hooks.initialize) await hook()
        for(let hook of this.hooks.initialized) await hook()
        for(let hook of this.hooks.load) await hook()
        for(let hook of this.hooks.loaded) await hook()
        
        for(let hook of this.hooks.import) await hook()
        for(let hook of this.hooks.imported) await hook()
        
        await this.process()
    }
    static abortController
    static async process() {
        if (this.abortController?.signal.aborted) return
        else if (this.abortController) {
            await this.cancel()            
        }

        this.abortController = new AbortController()
        const { signal } = this.abortController

        for(let hook of this.hooks.process) await hook()
        for(let hook of this.hooks.processed) await hook()
        
        for(let hook of this.hooks.persist) await hook()
        for(let hook of this.hooks.persisted) await hook()
        
        await this.render(signal)
    }
    static async render(signal) {
        for(let hook of this.hooks.beforeRender) {
            if (signal.aborted) break
            await hook(signal)
        } 
        for(let hook of this.hooks.render) {
            if (signal.aborted) break
            await hook(signal)
        } 
        for(let hook of this.hooks.afterRender) {
            if (signal.aborted) break
            await hook(signal)
        } 
        
        await this.finalize(signal)
    }
    static async cancel() {
        for(let hook of this.hooks.cancel) await hook()
        this.abortController?.abort()
        for(let hook of this.hooks.cancelled) await hook()
    }
    static async finalize(signal) {
        for(let hook of this.hooks.finalize) {
            if (signal.aborted) break
            await hook(signal)
        } 
        for(let hook of this.hooks.finalized) {
            if (signal.aborted) break
            await hook(signal)
        } 
        this.abortController = undefined
    }
    static async sync(operation) {
        let synced
        for(let hook of this.hooks.sync) {
            const result = await hook(operation)
            if (result === true) {
                synced = true
            } else if (result === false && !synced) {
				synced = false
            }
        }
        return synced === undefined || synced
    }
}