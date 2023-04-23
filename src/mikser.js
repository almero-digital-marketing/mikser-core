import { Mutex } from 'await-semaphore'
import { AbortError } from './utils.js'

export default class {
    static stamp = Date.now()
    static processTime
    static runtime = {}
    static options = {
        plugins: []
    }
    static config = {}
    static journal = []
    static validators = []
    static started = false
    static mutex = new Mutex()
    static hooks = {
        initialize: [],
        initialized: [],
        load: [],
        loaded: [],
        import: [],
        validate: [],
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
        completed: [],
    }
    static async callHooks(hooks, signal) {
        for(let hook of hooks) {
            if (signal?.aborted) throw new AbortError() 
            await hook(signal)
        }
    }
    static async start() {
        await this.callHooks(this.hooks.initialize)
        await this.callHooks(this.hooks.initialized)
        await this.callHooks(this.hooks.load)
        await this.callHooks(this.hooks.loaded)
        
        await this.callHooks(this.hooks.import)
        await this.callHooks(this.hooks.imported)
        
        this.started = true
        await this.process()
    }
    static abortController
    static async process() {
        if (this.abortController?.signal.aborted) return
        else if (this.abortController) {
            await this.cancel()            
        }
        this.mutex.use(async () => {
            try {
                this.abortController = new AbortController()
                const { signal } = this.abortController
        
                await this.callHooks(this.hooks.process, signal)
                await this.callHooks(this.hooks.processed, signal)
                await this.callHooks(this.hooks.persist, signal)
                await this.callHooks(this.hooks.persisted, signal)
                
                await this.render(signal)
            } catch (e) {
                if (e.name !== "AbortError") throw e
                for(let hook of this.hooks.cancelled) await hook()
            }
        })
    }
    static async render(signal) {
        await this.callHooks(this.hooks.beforeRender, signal)
        await this.callHooks(this.hooks.render, signal)
        await this.callHooks(this.hooks.afterRender, signal)

        await this.finalize(signal)
    }
    static async cancel() {
        this.abortController?.abort()

        await this.callHooks(this.hooks.cancel)
    }
    static async finalize(signal) {
        await this.callHooks(this.hooks.finalize, signal)
        await this.callHooks(this.hooks.finalized, signal)
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
    static async validate(entry) {
        for(let hook of this.validators) {
            if (!await hook(entry)) return false
        }
        return true
    }
    static async complete(entry) {
        let success = true
        for(let hook of this.hooks.completed) {
            if (await hook(entry) === false) success = false
        }
        entry.success = success
    }
}