import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import dataPlugin from '../../../src/plugins/data.js'
import { createHarness } from '../plugin-harness.js'

describe('data plugin', () => {
    it('registers core lifecycle hooks', () => {
        const h = createHarness()
        dataPlugin(h.core)
        assert.ok(h.hooks.loaded.length >= 1)
        assert.ok(h.hooks.afterRender.length >= 1)
        assert.ok(h.hooks.finalize.length >= 1)
        assert.ok(h.hooks.beforeRender.length >= 1)
    })

    it('computes dataFolder under outputFolder on onLoaded', async () => {
        const workingFolder = await mkdtemp(path.join(tmpdir(), 'mikser-data-'))
        try {
            const outputFolder = path.join(workingFolder, 'out')
            const h = createHarness({ options: { workingFolder, outputFolder } })
            dataPlugin(h.core)
            await h.runHook('loaded')
            assert.equal(h.runtime.options.dataFolder, path.join(outputFolder, 'data'))
        } finally {
            await rm(workingFolder, { recursive: true, force: true })
        }
    })
})
