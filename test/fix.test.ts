/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { Model } from '../dist/model'


const GEN = __dirname + '/../test/_gen'


describe('fix', () => {

  // A model failure must not stick to later builds. The BuildImpl is reused
  // across watch rebuilds, so its error state has to reset every run. This
  // also exercises that aontu errors are collected (not thrown) into errs.
  test('recovers-from-model-error', async () => {
    const dir = GEN + '/err01'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })

    const path = dir + '/model.jsonic'
    const log = prettyPino('test', {})

    // Conflicting scalar values do not unify -> a collected model error.
    await writeFile(path, 'x: 1\nx: 2\n')

    const b = makeBuild({ fs: Fs, base: dir, path, res: [] }, log)

    const bad = await b.run({ watch: false })
    assert.strictEqual(bad.ok, false, 'invalid model should fail')
    assert.ok(0 < bad.errs.length, 'invalid model should report errors')

    // Repair the model and rebuild on the SAME instance.
    await writeFile(path, 'x: 1\n')

    const good = await b.run({ watch: false })
    assert.strictEqual(good.ok, true, 'build should recover after repair')
    assert.strictEqual(good.errs.length, 0, 'errors must not leak across runs')
    assert.deepStrictEqual((b as any).model, { x: 1 })
  })


  // An order entry that names an undefined action should fail with a clear
  // message rather than an opaque "cannot read properties of undefined".
  test('clear-error-on-unknown-action', async () => {
    const dir = GEN + '/act01'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await mkdir(dir + '/build', { recursive: true })

    await writeFile(dir + '/model/model.jsonic', 'top: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.jsonic',
      "sys: model: action: { real: load: 'build/real' }\n" +
      "sys: model: order: action: 'real,ghost'\n")
    await writeFile(dir + '/build/real.js',
      'module.exports = async () => ({ ok: true })\n')

    const model = new Model({
      path: dir + '/model/model.jsonic',
      base: dir + '/model',
      // The build deliberately errors; silence the expected log noise.
      debug: 'silent',
    })
    const br = await model.run()

    assert.strictEqual(br.ok, false, 'unknown action should fail the build')
    const msg = String(br.errs[0]?.message ?? br.errs[0] ?? '')
    assert.match(msg, /Unknown model action "ghost"/)
  })


  // An action definition with no load path should also fail clearly.
  test('clear-error-on-missing-load', async () => {
    const dir = GEN + '/act02'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })

    await writeFile(dir + '/model/model.jsonic', 'top: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.jsonic',
      'sys: model: action: { noload: {} }\n' +
      "sys: model: order: action: 'noload'\n")

    const model = new Model({
      path: dir + '/model/model.jsonic',
      base: dir + '/model',
      debug: 'silent',
    })
    const br = await model.run()

    assert.strictEqual(br.ok, false, 'action without load should fail')
    const msg = String(br.errs[0]?.message ?? br.errs[0] ?? '')
    assert.match(msg, /Model action "noload" is missing a "load" path/)
  })


  // An action that throws at run time must fail the build and surface the
  // error rather than silently passing.
  test('action-error-fails-build', async () => {
    const dir = GEN + '/throw01'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await mkdir(dir + '/build', { recursive: true })

    await writeFile(dir + '/model/model.jsonic', 'top: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.jsonic',
      "sys: model: action: { boom: load: 'build/boom' }\n")
    await writeFile(dir + '/build/boom.js',
      "module.exports = async () => { throw new Error('boom-action') }\n")

    const model = new Model({
      path: dir + '/model/model.jsonic',
      base: dir + '/model',
      debug: 'silent',
    })
    const br = await model.run()

    assert.strictEqual(br.ok, false, 'a throwing action should fail the build')
    const msg = String(br.errs[0]?.message ?? br.errs[0] ?? '')
    assert.match(msg, /boom-action/)
  })


  // dryrun must not write to the real filesystem, including via the
  // promise-based fs API.
  test('dryrun-readonly-promises', async () => {
    const dir = GEN + '/dry01'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })

    const model: any = new Model({
      path: dir + '/model.jsonic',
      base: dir,
      dryrun: true,
    })

    // Parent dir (cwd) exists in the dryrun in-memory volume.
    const target = process.cwd() + '/.dryrun-probe-' + Date.now() + '.tmp'
    try {
      await model.fs.promises.writeFile(target, 'NOPE')
    }
    catch {
      // A rejection is also acceptable: nothing reached the real disk.
    }

    const onDisk = Fs.existsSync(target)
    if (onDisk) {
      Fs.unlinkSync(target)
    }
    assert.strictEqual(onDisk, false,
      'dryrun promises.writeFile must not touch the real filesystem')
  })

})
