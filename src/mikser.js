export default class Mikser {
    static stamp = Date.now()
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
        for(let hook of this.hooks.process) await hook()
        for(let hook of this.hooks.processed) await hook()

        for(let hook of this.hooks.persist) await hook()
        for(let hook of this.hooks.persisted) await hook()

        await this.render()
    }
    static async render() {
        await this.cancel()

        for(let hook of this.hooks.beforeRender) await hook()
        for(let hook of this.hooks.render) await hook()
        for(let hook of this.hooks.afterRender) await hook()

        await this.finalize()
    }
    static async cancel() {
        for(let hook of this.hooks.cancel) await hook()
        for(let hook of this.hooks.cancelled) await hook()
        
        this.operations = []
    }
    static async finalize() {
        for(let hook of this.hooks.finalize) await hook()
        for(let hook of this.hooks.finalized) await hook()

        this.operations = []
    }
    static async sync(operation) {
        let synced
        for(let hook of this.hooks.sync) {
            const result = await hook(operation)
            if (result === true) {
                synced = true
            } else if (result === false) {
                if (!synced) {
                    synced = false
                }
            }
        }
        return synced === undefined || synced
    }
}