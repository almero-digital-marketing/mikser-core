import { constants } from "./constants.js"

export default class {
    static stamp = Date.now()
    static processTime
    static runtime = {}
    static options = {
        plugins: []
    }
    static config = {}
    static operations = []
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
    static abortController
    static abort(signal) {
        if (signal.aborted) {
            this.operations = []
        }
        return signal.aborted
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
    static async process() {
        this.abortController?.abort()
        await this.cancel()

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
            if (this.abort(signal)) return
            await hook(signal)
        } 

        for(let hook of this.hooks.render) {
            if (this.abort(signal)) return
            await hook(signal)
        } 
        for(let hook of this.hooks.afterRender) {
            if (this.abort(signal)) return
            await hook(signal)
        } 
        
        await this.finalize(signal)
    }
    static async cancel() {
        for(let hook of this.hooks.cancel) await hook()
        for(let hook of this.hooks.cancelled) await hook()

        this.operations = this.operations.filter(({operation}) => operation != constants.OPERATION_RENDER)
    }
    static async finalize(signal) {
        for(let hook of this.hooks.finalize) {
            if (this.abort(signal)) return
            await hook(signal)
        } 
        for(let hook of this.hooks.finalized) {
            if (this.abort(signal)) return
            await hook(signal)
        } 

        this.operations = []
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