/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'


const GEN = __dirname + '/../test/_gen'

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}

// Push a file's mtime clearly into the future so a content change is always
// seen as newer than the cached signature, regardless of filesystem mtime
// resolution.
function bumpMtime(path: string) {
  const future = new Date(Date.now() + 5000)
  Fs.utimesSync(path, future, future)
}


describe('cache', () => {

  // A second build with no file change is a cache hit: resolveModel returns
  // early and reuses the same model object rather than re-unifying.
  test('reuses-unchanged-model', async () => {
    const dir = GEN + '/cache-hit'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    const path = dir + '/m.jsonic'
    await writeFile(path, 'a: 1\n')

    const b: any = makeBuild({ fs: Fs, base: dir, path, res: [] }, silentLog())

    const r1 = await b.run({ watch: false })
    assert.strictEqual(r1.ok, true)
    const model1 = b.model
    assert.deepStrictEqual(model1, { a: 1 })

    // No change between runs -> the cached model object is reused (identity
    // preserved). A re-unification would produce a fresh object.
    const r2 = await b.run({ watch: false })
    assert.strictEqual(r2.ok, true)
    assert.strictEqual(b.model, model1,
      'unchanged model should be reused (cache hit)')
  })


  // Changing a tracked file invalidates the cache: the next build re-unifies
  // and produces a fresh model reflecting the new source.
  test('re-resolves-changed-model', async () => {
    const dir = GEN + '/cache-miss'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    const path = dir + '/m.jsonic'
    await writeFile(path, 'a: 1\n')

    const b: any = makeBuild({ fs: Fs, base: dir, path, res: [] }, silentLog())

    const r1 = await b.run({ watch: false })
    assert.strictEqual(r1.ok, true)
    const model1 = b.model

    await writeFile(path, 'a: 2\n')
    bumpMtime(path)

    const r2 = await b.run({ watch: false })
    assert.strictEqual(r2.ok, true)
    assert.notStrictEqual(b.model, model1,
      'changed file should be re-resolved (cache miss)')
    assert.deepStrictEqual(b.model, { a: 2 })
  })


  // A successful build primes the cache, but a later model error must still
  // surface: the cache cannot mask a freshly broken model.
  test('error-not-masked-by-cache', async () => {
    const dir = GEN + '/cache-err'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    const path = dir + '/m.jsonic'
    await writeFile(path, 'a: 1\n')

    const b: any = makeBuild({ fs: Fs, base: dir, path, res: [] }, silentLog())

    assert.strictEqual((await b.run({ watch: false })).ok, true)

    // Conflicting scalar values do not unify.
    await writeFile(path, 'a: 1\na: 2\n')
    bumpMtime(path)

    const bad = await b.run({ watch: false })
    assert.strictEqual(bad.ok, false, 'broken model must not be served from cache')
    assert.ok(0 < bad.errs.length)
  })

})
