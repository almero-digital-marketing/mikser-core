class Mikser {
    static mikser = {
        stamp: Date.now(),
        runtime: {},
        options: {
            plugins: []
        },
        config: {},
        operations: [],
        hooks: {
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
        },
        async start() {
            for(let hook of mikser.hooks.initialize) await hook()
            for(let hook of mikser.hooks.initialized) await hook()
            for(let hook of mikser.hooks.load) await hook()
            for(let hook of mikser.hooks.loaded) await hook()

            for(let hook of mikser.hooks.import) await hook()
            for(let hook of mikser.hooks.imported) await hook()

            await mikser.process()
        },
        async process() {
            for(let hook of mikser.hooks.process) await hook()
            for(let hook of mikser.hooks.processed) await hook()

            for(let hook of mikser.hooks.persist) await hook()
            for(let hook of mikser.hooks.persisted) await hook()

            await mikser.render()
        },
        async render() {
            await mikser.cancel()

            for(let hook of mikser.hooks.beforeRender) await hook()
            for(let hook of mikser.hooks.render) await hook()
            for(let hook of mikser.hooks.afterRender) await hook()

            await mikser.finalize()
        },
        async cancel() {
            for(let hook of mikser.hooks.cancel) await hook()
            for(let hook of mikser.hooks.cancelled) await hook()
            
            mikser.operations = []
        },
        async finalize() {
            for(let hook of mikser.hooks.finalize) await hook()
            for(let hook of mikser.hooks.finalized) await hook()

            mikser.operations = []
        },
        async sync(operation) {
            for(let hook of mikser.hooks.sync) await hook(operation)
        }
    }
}
const { mikser } = Mikser

export default mikser

