/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { Model } from '../dist/model'
import { model_producer } from '../dist/producer/model'
import type { Build, BuildContext } from '../dist/types'


const GEN = __dirname + '/../test/_gen'

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}

function okResult(name: string) {
  return { ok: true, name, step: '', active: true, reload: false, errs: [], runlog: [] }
}


// aontu errors carry circular Val graphs, so JSON.stringify(errs) throws
// ERR_TEST_FAILURE on the message rather than reporting the real failure.
function errtext(errs: any[]) {
  return (errs || []).map((e: any) => e && (e.msg || e.message) || String(e)).join(' | ')
}


describe('extra', () => {

  // A producer that throws in the pre phase fails the build, and the error is
  // collected rather than escaping.
  test('producer-throws-in-pre', async () => {
    const dir = GEN + '/ex-pre'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon',
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
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon',
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
      fs: Fs, base: GEN, path: GEN + '/does-not-exist.aon', res: [],
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

    await writeFile(dir + '/model/m.aon', 'a: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aon',
      "sys: model: action: { p: load: 'build/p' }\n")
    await writeFile(dir + '/build/p.js',
      "const Path = require('node:path')\n" +
      'module.exports = Promise.resolve(async function p(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
      '  return { ok: true }\n' +
      '})\n')

    const model = new Model({
      path: dir + '/model/m.aon', base: dir + '/model', debug: 'silent',
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.strictEqual(await readFile(dir + '/p.txt', 'utf8'), 'OK')
  })


  // A producer that returns ok:false in the pre phase fails the build.
  test('producer-returns-not-ok-pre', async () => {
    const dir = GEN + '/ex-nokpre'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon',
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
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon',
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
    await writeFile(dir + '/model/m.aon', 'a: 1\n')

    const model = new Model({
      path: dir + '/model/m.aon', base: dir + '/model', debug: 'silent',
      config: false,
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
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

    await writeFile(dir + '/model/m.aon', 'a: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aon',
      "sys: model: action: { p: load: 'build/p' }\n")
    await writeFile(dir + '/build/p.js',
      "const Path = require('node:path')\n" +
      'module.exports = async function p(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
      '  return { ok: true }\n' +
      '}\n')

    const model = new Model({
      path: dir + '/model/m.aon', base: dir + '/model', debug: 'silent',
      config: false,
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.strictEqual(Fs.existsSync(dir + '/p.txt'), false,
      'config action should not run when config is disabled')
  })


  // An unresolved import makes aontu throw; the build collects it as an error
  // rather than letting it escape.
  // Aontu comments are `#` only: makeBuild disables the jsonic defaults for
  // `//` and `/* */` so the npm engine matches the Go parser. The equivalent
  // Go test is TestCommentHashOnly in go/extra_test.go.
  test('comment-hash-only', async () => {
    const cases: [string, string, boolean][] = [
      ['hash', '# note\na: 1\n', true],
      ['slash', 'a: 1 // nope\n', false],
      ['multi', 'a: /* nope */ 1\n', false],
    ]

    for (const [name, src, ok] of cases) {
      const dir = GEN + '/ex-comment-' + name
      await rm(dir, { recursive: true, force: true })
      await mkdir(dir, { recursive: true })
      await writeFile(dir + '/m.aon', src)

      const b = makeBuild({
        fs: Fs, base: dir, path: dir + '/m.aon', res: [],
      }, silentLog())

      const v = await b.run({ watch: false })
      assert.strictEqual(v.ok, ok, name + ' comment: expected ok=' + ok)
    }
  })


  // The model serializer mirrors JSON.stringify for values only a mutating
  // producer can introduce (aontu sources cannot express them): undefined,
  // function, and symbol props are dropped; undefined array elements and
  // sparse holes become null; toJSON results (e.g. Date) are re-serialized
  // canonically — sorted keys and indentation apply to structured toJSON
  // output too. Key order stays lexical byte order — numeric-string keys do
  // not jump ahead. The shared-spec rows in test/spec/output.tsv lock the
  // aontu-reachable surface; this locks the rest of the TS serializer.
  test('model-serializer-mutated-values', async () => {
    const dir = GEN + '/ex-serializer'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon',
      res: [
        {
          path: '/', build: async function mutate(build: Build, ctx: BuildContext) {
            if ('post' === ctx.step) {
              build.model.gone = undefined
              build.model.helper = () => 1
              build.model.sym = Symbol('x')
              build.model.list = [1, undefined, 2]
              build.model.sparse = new Array(2)
              build.model.when = new Date('2026-01-02T03:04:05.678Z')
              build.model.wrap = { toJSON: () => ({ '10': 'ten', '9': 'nine' }) }
              build.model['10'] = 'ten'
              build.model['9'] = 'nine'
            }
            return okResult('mutate')
          },
        },
        { path: '/', build: model_producer },
      ],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, true)
    assert.strictEqual(await readFile(dir + '/m.json', { encoding: 'utf8' }), `{
  "10": "ten",
  "9": "nine",
  "a": 1,
  "list": [
    1,
    null,
    2
  ],
  "sparse": [
    null,
    null
  ],
  "when": "2026-01-02T03:04:05.678Z",
  "wrap": {
    "10": "ten",
    "9": "nine"
  }
}`)
  })


  test('unresolved-import-fails', async () => {
    const dir = GEN + '/ex-import'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon', 'top: @"./missing.aon"\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aon', res: [],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(0 < v.errs.length)
  })


  // A legacy .model-config/model-config.aontu is migrated to .aon. The copy
  // is NOT verbatim: this package's own config moved to .aon in v10, so a
  // legacy config's import of it names a file that no longer ships, and a
  // straight copy leaves the migrated config unresolvable
  // (aontu/multisource_not_found) on the very first build after upgrading.
  test('legacy-config-migrates-with-package-import-retargeted', async () => {
    const dir = GEN + '/ex-migrate-pkg'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await writeFile(dir + '/model/model.aon', 'x: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aontu', `
@"@voxgig/model/model/.model-config/model-config.aontu"

sys: model: action: {}
`)

    const model = new Model({
      fs: Fs,
      path: dir + '/model/model.aon',
      base: dir + '/model',
      debug: 'silent',
    } as any)
    const br = await model.run()

    assert.ok(br.ok, 'migrated config did not build: ' + errtext(br.errs))
    assert.strictEqual(
      Fs.existsSync(dir + '/model/.model-config/model-config.aontu'), false,
      'the legacy config should be gone once migrated')

    const migrated = await readFile(
      dir + '/model/.model-config/model-config.aon', 'utf8')
    assert.ok(
      migrated.includes('@voxgig/model/model/.model-config/model-config.aon"'),
      'the package import should name .aon: ' + migrated)
  })


  // Only the @voxgig/model import is retargeted. A project's OWN .aontu
  // imports still name real files on disk, so rewriting them would break
  // exactly the declarations the migration exists to preserve.
  test('legacy-config-keeps-its-own-aontu-imports', async () => {
    const dir = GEN + '/ex-migrate-own'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await writeFile(dir + '/model/model.aon', 'x: 1\n')
    await writeFile(dir + '/model/.model-config/local.aontu',
      'sys: model: action: {}\n')
    await writeFile(dir + '/model/.model-config/model-config.aontu', `
@"@voxgig/model/model/.model-config/model-config.aontu"
@"local.aontu"
`)

    const model = new Model({
      fs: Fs,
      path: dir + '/model/model.aon',
      base: dir + '/model',
      debug: 'silent',
    } as any)
    const br = await model.run()

    assert.ok(br.ok, 'migrated config did not build: ' + errtext(br.errs))

    const migrated = await readFile(
      dir + '/model/.model-config/model-config.aon', 'utf8')
    assert.ok(migrated.includes('@"local.aontu"'),
      "a project's own .aontu import must be left alone: " + migrated)
  })


  // The rewrite is anchored to aontu's import syntax, not to the bare
  // pathname. A legacy config may carry this package's path as ordinary
  // string DATA — a note, a compatibility path in action metadata — and an
  // unanchored match would silently edit that value during a one-time
  // migration. Same principle as the test above: migrate imports, never
  // declarations. (Reported by Codex review on voxgig/model#16.)
  test('legacy-config-rewrite-does-not-touch-string-data', async () => {
    const dir = GEN + '/ex-migrate-data'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await writeFile(dir + '/model/model.aon', 'x: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aontu', `
@"@voxgig/model/model/.model-config/model-config.aontu"

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aontu'
`)

    const model = new Model({
      fs: Fs,
      path: dir + '/model/model.aon',
      base: dir + '/model',
      debug: 'silent',
    } as any)
    const br = await model.run()

    assert.ok(br.ok, 'migrated config did not build: ' + errtext(br.errs))

    const migrated = await readFile(
      dir + '/model/.model-config/model-config.aon', 'utf8')

    // The import moved...
    assert.ok(
      migrated.includes('@"@voxgig/model/model/.model-config/model-config.aon"'),
      'the import should name .aon: ' + migrated)
    // ...and the string value did not.
    assert.ok(
      migrated.includes("was: '@voxgig/model/model/.model-config/model-config.aontu'"),
      'a path held as string data must be left alone: ' + migrated)
  })

})
