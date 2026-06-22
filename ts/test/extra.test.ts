/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { Model } from '../dist/model'
import type { Build, BuildContext } from '../dist/types'


const GEN = __dirname + '/../test/_gen'

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}

function okResult(name: string) {
  return { ok: true, name, step: '', active: true, reload: false, errs: [], runlog: [] }
}


describe('extra', () => {

  // A producer that throws in the pre phase fails the build, and the error is
  // collected rather than escaping.
  test('producer-throws-in-pre', async () => {
    const dir = GEN + '/ex-pre'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.jsonic', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.jsonic',
      res: [{
        path: '/', build: async function boom(_build: Build, ctx: BuildContext) {
          if ('pre' === ctx.step) { throw new Error('pre-boom') }
          return okResult('boom')
        },
      }],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(v.errs.some((e: any) => String(e.message ?? e).includes('pre-boom')))
  })


  // A producer that throws in the post phase fails the build.
  test('producer-throws-in-post', async () => {
    const dir = GEN + '/ex-post'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.jsonic', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.jsonic',
      res: [{
        path: '/', build: async function boom(_build: Build, ctx: BuildContext) {
          if ('post' === ctx.step) { throw new Error('post-boom') }
          return okResult('boom')
        },
      }],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(v.errs.some((e: any) => String(e.message ?? e).includes('post-boom')))
  })


  // A missing root file fails the build with the read error.
  test('missing-root-file', async () => {
    const b = makeBuild({
      fs: Fs, base: GEN, path: GEN + '/does-not-exist.jsonic', res: [],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(0 < v.errs.length)
  })


  // An action module may export a Promise resolving to the action function;
  // the local producer awaits it before running.
  test('promise-exported-action', async () => {
    const dir = GEN + '/ex-promise'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await mkdir(dir + '/build', { recursive: true })

    await writeFile(dir + '/model/m.jsonic', 'a: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.jsonic',
      "sys: model: action: { p: load: 'build/p' }\n")
    await writeFile(dir + '/build/p.js',
      "const Path = require('node:path')\n" +
      'module.exports = Promise.resolve(async function p(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
      '  return { ok: true }\n' +
      '})\n')

    const model = new Model({
      path: dir + '/model/m.jsonic', base: dir + '/model', debug: 'silent',
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + JSON.stringify(br.errs))
    assert.strictEqual(await readFile(dir + '/p.txt', 'utf8'), 'OK')
  })


  // A producer that returns ok:false in the pre phase fails the build.
  test('producer-returns-not-ok-pre', async () => {
    const dir = GEN + '/ex-nokpre'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.jsonic', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.jsonic',
      res: [{
        path: '/', build: async function bad(_build: Build, ctx: BuildContext) {
          return {
            ok: 'pre' !== ctx.step, name: 'bad', step: ctx.step,
            active: true, reload: false, errs: [], runlog: [],
          }
        },
      }],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
  })


  // A producer that returns ok:false in the post phase fails the build.
  test('producer-returns-not-ok-post', async () => {
    const dir = GEN + '/ex-nokpost'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.jsonic', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.jsonic',
      res: [{
        path: '/', build: async function bad(_build: Build, ctx: BuildContext) {
          return {
            ok: 'post' !== ctx.step, name: 'bad', step: ctx.step,
            active: true, reload: false, errs: [], runlog: [],
          }
        },
      }],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
  })


  // With config disabled, the model builds on its own: no .model-config/ is
  // created, no actions run, but the model JSON is still written.
  test('config-optional-skips-config', async () => {
    const dir = GEN + '/ex-noconfig'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model', { recursive: true })
    await writeFile(dir + '/model/m.jsonic', 'a: 1\n')

    const model = new Model({
      path: dir + '/model/m.jsonic', base: dir + '/model', debug: 'silent',
      config: false,
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + JSON.stringify(br.errs))
    assert.deepStrictEqual(JSON.parse(await readFile(dir + '/model/m.json', 'utf8')), { a: 1 })
    assert.strictEqual(Fs.existsSync(dir + '/model/.model-config'), false,
      '.model-config should not be created when config is disabled')
  })


  // An action declared in config is ignored when config is disabled, even if a
  // .model-config file already exists.
  test('config-optional-ignores-existing-config', async () => {
    const dir = GEN + '/ex-noconfig-existing'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await mkdir(dir + '/build', { recursive: true })

    await writeFile(dir + '/model/m.jsonic', 'a: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.jsonic',
      "sys: model: action: { p: load: 'build/p' }\n")
    await writeFile(dir + '/build/p.js',
      "const Path = require('node:path')\n" +
      'module.exports = async function p(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
      '  return { ok: true }\n' +
      '}\n')

    const model = new Model({
      path: dir + '/model/m.jsonic', base: dir + '/model', debug: 'silent',
      config: false,
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + JSON.stringify(br.errs))
    assert.strictEqual(Fs.existsSync(dir + '/p.txt'), false,
      'config action should not run when config is disabled')
  })


  // An unresolved import makes aontu throw; the build collects it as an error
  // rather than letting it escape.
  test('unresolved-import-fails', async () => {
    const dir = GEN + '/ex-import'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.jsonic', 'top: @"./missing.jsonic"\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.jsonic', res: [],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(0 < v.errs.length)
  })

})
