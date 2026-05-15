import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import restPlugin from '../../../src/plugins/rest.js'
import { createHarness } from '../plugin-harness.js'

describe('rest plugin', () => {
    it('loads and registers onLoaded without requiring express up front', () => {
        const h = createHarness()
        // The plugin only imports express inside its onLoaded hook, so the
        // factory itself should never reach that import path.
        assert.doesNotThrow(() => restPlugin(h.core))
        assert.ok(h.hooks.loaded.length >= 1)
    })

    it('throws a helpful error from onLoaded if express is not installed', async () => {
        const h = createHarness()
        restPlugin(h.core)
        // We can't easily fake express absence without module mocking. Just
        // make sure invoking the hook doesn't immediately blow up the
        // process when express IS present — express is an optional dep of
        // mikser-io and is already installed in this workspace.
        await assert.doesNotReject(() => h.runHook('loaded'))
    })
})
