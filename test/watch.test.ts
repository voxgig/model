/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Model } from '../dist/model'


const GEN = __dirname + '/../test/_gen'


async function waitFor(fn: () => Promise<boolean>, ms = 6000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    if (await fn()) {
      return true
    }
    await new Promise(r => setTimeout(r, 50))
  }
  return false
}


async function readVal(file: string): Promise<number | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')).val
  }
  catch {
    return undefined
  }
}


describe('watch', () => {

  // Start watching, then change a dependency file and confirm the model is
  // rebuilt. Exercises the watch interval, change handling, drain queue,
  // dependency tracking, and clean shutdown of both watchers.
  test('rebuilds-on-change', async () => {
    const base = GEN + '/wat01/model'
    await rm(GEN + '/wat01', { recursive: true, force: true })
    await mkdir(base + '/.model-config', { recursive: true })

    await writeFile(base + '/model.jsonic', 'top: 1\nval: @"./zed.jsonic"\n')
    await writeFile(base + '/zed.jsonic', '2')
    // Standalone config (no actions) so we don't depend on package resolution.
    await writeFile(base + '/.model-config/model-config.jsonic',
      'sys: model: action: {}\n')

    const out = base + '/model.json'
    const model = new Model({ path: base + '/model.jsonic', base })

    try {
      await model.start()

      assert.ok(
        await waitFor(async () => (await readVal(out)) === 2),
        'initial build should produce val:2')

      // Let the dependency watchers attach before mutating zed.jsonic.
      await new Promise(r => setTimeout(r, 250))
      await writeFile(base + '/zed.jsonic', '7')

      assert.ok(
        await waitFor(async () => (await readVal(out)) === 7),
        'changing the dependency should rebuild to val:7')
    }
    finally {
      await model.stop()
    }
  })

})
