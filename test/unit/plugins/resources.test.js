import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import resourcesPlugin from '../../../src/plugins/resources.js'
import { createHarness } from '../plugin-harness.js'

describe('resources plugin', () => {
    it('loads without throwing when no resources config is present', () => {
        const h = createHarness()
        assert.doesNotThrow(() => resourcesPlugin(h.core))
    })

    it('registers onLoaded, onProcessed, onFinalize', () => {
        const h = createHarness()
        resourcesPlugin(h.core)
        assert.ok(h.hooks.loaded.length >= 1)
        assert.ok(h.hooks.processed.length >= 1)
        assert.ok(h.hooks.finalize.length >= 1)
    })
})
