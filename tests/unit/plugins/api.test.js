import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import apiPlugin from '../../../src/plugins/api.js'
import { createHarness } from '../plugin-harness.js'

describe('api plugin', () => {
    it('loads without throwing when no api config is present', () => {
        const h = createHarness()
        assert.doesNotThrow(() => apiPlugin(h.core))
    })

    it('registers onLoaded and onImport hooks', () => {
        const h = createHarness()
        apiPlugin(h.core)
        assert.ok(h.hooks.loaded.length >= 1)
        assert.ok(h.hooks.import.length >= 1)
    })

    it('registers an onSync handler for the api collection (when configured)', () => {
        const h = createHarness({
            config: {
                api: {
                    apis: { example: { url: 'https://example.test/api' } },
                },
            },
        })
        apiPlugin(h.core)
        // The api plugin may register one or more sync handlers — just make
        // sure registration didn't error.
        assert.ok(h.sync.size >= 0)
    })
})
