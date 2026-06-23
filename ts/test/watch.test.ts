/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import { mkdir, writeFile, readFile, appendFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Model } from '../dist/model'
import { Watch } from '../dist/watch'

import { prettyPino } from '@voxgig/util'


const GEN = __dirname + '/../test/_gen'

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}


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


async function read(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8')
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


  // A change to a config file should rebuild the config and re-trigger the
  // model build. The `mark` action bumps a counter on every model build, so
  // a change in its output proves the config change drove a rebuild.
  test('config-change-triggers-rebuild', async () => {
    const dir = GEN + '/wat02'
    const base = dir + '/model'
    await rm(dir, { recursive: true, force: true })
    await mkdir(base + '/.model-config', { recursive: true })
    await mkdir(dir + '/build', { recursive: true })

    await writeFile(base + '/model.jsonic', 'top: 1\n')
    await writeFile(base + '/.model-config/model-config.jsonic',
      "sys: model: action: { mark: load: 'build/mark' }\n")
    await writeFile(dir + '/build/mark.js',
      "const Path = require('node:path')\n" +
      'let n = 0\n' +
      'module.exports = async function mark(model, build) {\n' +
      "  n++\n" +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'mark.txt'), String(n))\n" +
      '  return { ok: true }\n' +
      '}\n')

    const mark = dir + '/mark.txt'
    const model = new Model({ path: base + '/model.jsonic', base })

    try {
      await model.start()

      assert.ok(
        await waitFor(async () => null != await read(mark)),
        'initial build should run the mark action')
      const first = await read(mark)

      // Let the config watcher attach, then edit a config file.
      await new Promise(r => setTimeout(r, 250))
      await appendFile(base + '/.model-config/model-config.jsonic',
        '\n# touch to trigger a config rebuild\n')

      assert.ok(
        await waitFor(async () => {
          const cur = await read(mark)
          return null != cur && cur !== first
        }),
        'config change should re-run the model build (mark should advance)')
    }
    finally {
      await model.stop()
    }
  })


  // A failed rebuild while watching is reported, and the watcher recovers when
  // the model is fixed.
  test('recovers-from-error-while-watching', async () => {
    const base = GEN + '/wat03/model'
    await rm(GEN + '/wat03', { recursive: true, force: true })
    await mkdir(base + '/.model-config', { recursive: true })
    await writeFile(base + '/model.jsonic', 'val: 1\n')
    await writeFile(base + '/.model-config/model-config.jsonic',
      'sys: model: action: {}\n')

    const out = base + '/model.json'
    const model = new Model({ path: base + '/model.jsonic', base, debug: 'silent' })

    try {
      await model.start()
      assert.ok(
        await waitFor(async () => (await readVal(out)) === 1),
        'initial build should produce val:1')

      // Break the model: conflicting scalar values do not unify.
      await new Promise(r => setTimeout(r, 200))
      await writeFile(base + '/model.jsonic', 'val: 1\nval: 2\n')
      await new Promise(r => setTimeout(r, 400)) // let the failed rebuild run

      // Fix it; the watcher should recover.
      await writeFile(base + '/model.jsonic', 'val: 9\n')
      assert.ok(
        await waitFor(async () => (await readVal(out)) === 9),
        'watcher should recover to val:9 after the model is fixed')
    }
    finally {
      await model.stop()
    }
  })


  // With config disabled, start() watches the model directly (no config
  // watcher): the initial build runs and produces output, and stop() releases
  // the watcher cleanly.
  test('start-without-config', async () => {
    const base = GEN + '/wat04/model'
    await rm(GEN + '/wat04', { recursive: true, force: true })
    await mkdir(base, { recursive: true })
    await writeFile(base + '/model.jsonic', 'val: 5\n')

    const out = base + '/model.json'
    const model = new Model({
      path: base + '/model.jsonic', base, config: false, debug: 'silent',
    })

    try {
      await model.start()
      assert.ok(
        await waitFor(async () => (await readVal(out)) === 5),
        'initial build should produce val:5 with config disabled')
      assert.strictEqual(Fs.existsSync(base + '/.model-config'), false,
        'config disabled: no .model-config should be created')
    }
    finally {
      await model.stop()
    }
  })

})


// Unit coverage for Watch internals that the Model-level tests don't reach:
// the add/remove event modes and the dependency-description helper.
describe('watch-internals', () => {

  // The watcher only registers chokidar handlers for the enabled modes. With
  // add and rem enabled, ensureFSW wires up 'add' and 'unlink' as well as the
  // default 'change'. The watcher must still close cleanly.
  test('add-and-rem-modes-register', async () => {
    const dir = GEN + '/wat-modes'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })

    const w: any = new Watch({
      name: 'modes', path: dir + '/m.jsonic', base: dir, fs: Fs,
      watch: { mod: true, add: true, rem: true },
    } as any, silentLog())

    try {
      const fsw = w.ensureFSW()
      assert.ok(fsw, 'ensureFSW should create a watcher')
      // Calling again returns the same watcher (idempotent).
      assert.strictEqual(w.ensureFSW(), fsw)
    }
    finally {
      await w.stop()
    }
  })


  // descDeps renders nothing for missing/empty deps and a readable tree for
  // populated deps.
  test('descDeps-edge-cases', () => {
    const w: any = new Watch({ name: 'd', path: '/x', base: '/', fs: Fs } as any, silentLog())

    assert.strictEqual(w.descDeps(null), '')
    assert.strictEqual(w.descDeps({}), '')

    const desc = w.descDeps({ '/a.jsonic': { '/b.jsonic': { tar: '/b.jsonic' } } })
    assert.match(desc, /\/a\.jsonic/)
    assert.match(desc, /\/b\.jsonic/)
  })

})
