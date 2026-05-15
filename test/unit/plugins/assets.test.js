import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import assetsPlugin from '../../../src/plugins/assets.js'
import { createHarness } from '../plugin-harness.js'

describe('assets plugin', () => {
    // The plugin's npm-facing name is "assets" but internally it tracks
    // transformed assets under the "presets" collection. Worth documenting
    // explicitly because the dual naming is easy to miss.
    it('returns its (internal) collection identifier', () => {
        const h = createHarness()
        const api = assetsPlugin(h.core)
        assert.equal(api.collection, 'presets')
        assert.equal(api.type, 'preset')
    })

    it('registers the expected hooks', () => {
        const h = createHarness()
        assetsPlugin(h.core)
        assert.ok(h.hooks.loaded.length >= 1)
        assert.ok(h.hooks.import.length >= 1)
        assert.ok(h.hooks.processed.length >= 1)
        assert.ok(h.hooks.beforeRender.length >= 1)
        assert.ok(h.hooks.complete.length >= 1)
        assert.ok(h.hooks.finalize.length >= 1)
        assert.ok(h.sync.has('presets'))
    })
})
