/* Copyright © 2026 Voxgig Ltd, MIT License. */

// Coverage for the remaining error/branch paths in build, watch and
// model: generate throwing, watch canon/change bookkeeping, relative
// add paths, run-build error capture, and Model.start without config.

import Fs from 'node:fs'
import Path from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { Watch } from '../dist/watch'
import { Model } from '../dist/model'


const GEN = __dirname + '/../test/_gen'

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}

async function fresh(name: string) {
  const dir = GEN + '/' + name
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  return dir
}


describe('cover-build', () => {

  // A throw from aontu.generate is caught and surfaces as a build error
  // rather than escaping the build.
  test('generate-throw-becomes-build-error', async () => {
    const dir = await fresh('cv-gen-throw')
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const b: any = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon', res: [],
    }, silentLog())

    b.aontu = {
      generate() {
        throw new Error('generate-boom')
      },
    }

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(v.errs.some((e: any) => String(e.message ?? e).includes('generate-boom')))
  })
})


describe('cover-watch', () => {

  test('canon maps a path inside a watched folder to the folder', async () => {
    const dir = await fresh('cv-canon')
    const sub = Path.join(dir, 'sub')
    await mkdir(sub, { recursive: true })
    await writeFile(Path.join(sub, 'a.aon'), 'a: 1\n')

    const w: any = new Watch({ fs: Fs, require: dir } as any, silentLog())
    w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) }

    try {
      await w.add(sub)

      // A file inside the watched folder canonicalises to the folder.
      assert.strictEqual(w.canon(Path.join(sub, 'a.aon')), sub)
      // An unrelated path is returned unchanged.
      const other = Path.join(dir, 'other.aon')
      assert.strictEqual(w.canon(other), other)
    }
    finally {
      await w.stop()
    }
  })

  test('handleChange records the last change', async () => {
    const dir = await fresh('cv-change')
    const w: any = new Watch({ fs: Fs, require: dir } as any, silentLog())
    w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) }

    try {
      const p = Path.join(dir, 'x.aon')
      w.handleChange(p)
      assert.strictEqual(w.lastChange.path, p)
      assert.ok(0 < w.lastChange.when)
    }
    finally {
      await w.stop()
    }
  })

  test('add resolves a relative path and ignores duplicates', async () => {
    const dir = await fresh('cv-add')
    await writeFile(Path.join(dir, 'r.aon'), 'a: 1\n')

    const w: any = new Watch({ fs: Fs, require: dir } as any, silentLog())
    w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) }

    try {
      await w.add('r.aon')
      const first = w.canonPaths.size
      // The same path again is a no-op.
      await w.add('r.aon')
      assert.strictEqual(w.canonPaths.size, first)
      assert.ok(w.canonPaths.has(Path.join(dir, 'r.aon')))
    }
    finally {
      await w.stop()
    }
  })

  test('a throwing build is captured as a failed run', async () => {
    const dir = await fresh('cv-run-throw')
    const w: any = new Watch({ fs: Fs, require: dir } as any, silentLog())
    w.build = {
      run: async () => {
        throw new Error('run-boom')
      },
    }

    try {
      const br = await w.run('model', false)
      assert.strictEqual(br.ok, false)
      assert.ok(br.errs.some((e: any) => String(e.message ?? e).includes('run-boom')))
    }
    finally {
      await w.stop()
    }
  })
})


describe('cover-model', () => {

  // With config:false the model runs standalone: start() delegates
  // straight to the watcher, no .model-config build.
  test('start without config uses the watcher directly', async () => {
    const dir = await fresh('cv-model-noconfig')
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const model: any = new Model({
      fs: Fs,
      base: dir,
      path: dir + '/m.aon',
      config: false,
      debug: 'silent',
      watch: false,
    } as any)

    assert.strictEqual(model.config, undefined)

    let started = false
    model.watch.start = async () => {
      started = true
      return { ok: true, errs: [], runlog: [] }
    }

    try {
      const out = await model.start()
      assert.ok(started)
      assert.strictEqual(out.ok, true)
    }
    finally {
      await model.stop()
    }
  })
})


describe('cover-model-more', () => {

  // The debug branch in the constructor logs the resolved spec.
  test('debug logging of the model spec', async () => {
    const dir = await fresh('cv-model-debug')
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const model: any = new Model({
      fs: Fs,
      base: dir,
      path: dir + '/m.aon',
      config: false,
      debug: 'debug',
      watch: false,
    } as any)

    try {
      assert.ok(model.log.isLevelEnabled('debug'))
    }
    finally {
      await model.stop()
    }
  })

  // start() with a config that fails returns the config's failed result
  // and never reaches the watcher.
  test('start returns a failed config build', async () => {
    const dir = await fresh('cv-model-badconfig')
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const model: any = new Model({
      fs: Fs,
      base: dir,
      path: dir + '/m.aon',
      debug: 'silent',
      watch: false,
    } as any)

    try {
      const failed = { ok: false, errs: [new Error('config-boom')], runlog: [] }
      model.config.run = async () => failed
      let watchStarted = false
      model.watch.start = async () => (watchStarted = true, { ok: true, errs: [], runlog: [] })

      const out = await model.start()
      assert.strictEqual(out.ok, false)
      assert.strictEqual(watchStarted, false)
    }
    finally {
      await model.stop()
    }
  })

  // In watch mode, files the model declares under sys.model.watch are
  // added to the watcher.
  test('sys.model.watch files are added to the watcher', async () => {
    const dir = await fresh('cv-model-watchmap')
    await writeFile(dir + '/m.aon', 'a: 1\n')
    await writeFile(dir + '/extra.aon', 'b: 2\n')

    // The watchmap is read from the CONFIG model, so declare it there.
    await mkdir(dir + '/.model-config', { recursive: true })
    await writeFile(dir + '/.model-config/model-config.aon', `
@"@voxgig/model/model/.model-config/model-config.aon"

sys: model: action: {}
sys: model: watch: { "${dir}/extra.aon": true }
`)

    // The watchmap is applied by the CONFIG build's producer, so config
    // stays enabled here.
    const model: any = new Model({
      fs: Fs,
      base: dir,
      path: dir + '/m.aon',
      debug: 'silent',
      watch: true,
    } as any)

    try {
      const added: string[] = []
      const origAdd = model.watch.add.bind(model.watch)
      model.watch.add = async (p: string) => {
        added.push(p)
        return origAdd(p)
      }

      // Only start() runs the config build in watch mode; keep the real
      // watchers out of it.
      model.watch.start = async () => ({ ok: true, errs: [], runlog: [] })
      model.config.start = () => undefined

      await model.start()
      assert.ok(added.some((p) => p.includes('extra.aon')))
    }
    finally {
      await model.stop()
    }
  })
})


describe('cover-watch-drain', () => {

  // drain() is re-entrant-safe: a second call while a drain is in flight
  // returns immediately (the running loop picks the queue up).
  test('drain returns early when already running', async () => {
    const dir = await fresh('cv-drain')
    const w: any = new Watch({ fs: Fs, require: dir } as any, silentLog())
    w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) }

    try {
      w.running = true
      w.runq.push({ name: 'model', watch: false })
      await w.drain()
      // Untouched: the in-flight drain owns the queue.
      assert.strictEqual(w.runq.length, 1)
    }
    finally {
      w.running = false
      await w.stop()
    }
  })
})
