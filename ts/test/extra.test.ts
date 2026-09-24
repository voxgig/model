/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import Path from 'node:path'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { Model } from '../dist/model'
import { model_producer } from '../dist/producer/model'
import { prepareConfig, readBack } from '../dist/config'
import type { Build, BuildContext } from '../dist/types'


const GEN = __dirname + '/../test/_gen'

const FLAG_CONFIG = (flag: number) =>
  '@"./local.aon"\nsys: model: action: {}\nsys: model: flag: ' + flag + '\n'

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// An edit a second into the future, so the mtime moves on any filesystem.
async function editLater(path: string, src: string) {
  await writeFile(path, src)
  const later = new Date(Date.now() + 1000)
  Fs.utimesSync(path, later, later)
}

async function flagProject(name: string) {
  const dir = GEN + '/' + name
  const cdir = dir + '/model/.model-config'
  await rm(dir, { recursive: true, force: true })
  await mkdir(cdir, { recursive: true })
  await writeFile(dir + '/model/model.aontu', 'x: 1\n')
  await writeFile(cdir + '/local.aontu', 'sys: model: order: action: *""\n')
  await writeFile(cdir + '/model-config.aon', FLAG_CONFIG(1))
  return { dir, cdir }
}

function configFlag(model: any) {
  return model.config?.watch.build?.model?.sys?.model?.flag
}

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}

function okResult(name: string) {
  return { ok: true, name, step: '', active: true, reload: false, errs: [], runlog: [] }
}


const LEGACY_CONFIG = `
@'@voxgig/model/model/.model-config/model-config.aon'
@ "./local.aon"

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aon'
# @"./retired.aon"
`

const MIGRATED_CONFIG = `
@'@voxgig/model/model/.model-config/model-config.aontu'
@ "./local.aontu"

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aon'
# @"./retired.aon"
`


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
    await writeFile(dir + '/m.aontu', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aontu',
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
    await writeFile(dir + '/m.aontu', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aontu',
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
      fs: Fs, base: GEN, path: GEN + '/does-not-exist.aontu', res: [],
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

    await writeFile(dir + '/model/m.aontu', 'a: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aontu',
      "sys: model: action: { p: load: 'build/p' }\n")
    await writeFile(dir + '/build/p.js',
      "const Path = require('node:path')\n" +
      'module.exports = Promise.resolve(async function p(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
      '  return { ok: true }\n' +
      '})\n')

    const model = new Model({
      path: dir + '/model/m.aontu', base: dir + '/model', debug: 'silent',
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
    await writeFile(dir + '/m.aontu', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aontu',
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
    await writeFile(dir + '/m.aontu', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aontu',
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
    await writeFile(dir + '/model/m.aontu', 'a: 1\n')

    const model = new Model({
      path: dir + '/model/m.aontu', base: dir + '/model', debug: 'silent',
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

    await writeFile(dir + '/model/m.aontu', 'a: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aontu',
      "sys: model: action: { p: load: 'build/p' }\n")
    await writeFile(dir + '/build/p.js',
      "const Path = require('node:path')\n" +
      'module.exports = async function p(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
      '  return { ok: true }\n' +
      '}\n')

    const model = new Model({
      path: dir + '/model/m.aontu', base: dir + '/model', debug: 'silent',
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
      await writeFile(dir + '/m.aontu', src)

      const b = makeBuild({
        fs: Fs, base: dir, path: dir + '/m.aontu', res: [],
      }, silentLog())

      const v = await b.run({ watch: false })
      assert.strictEqual(v.ok, ok, name + ' comment: expected ok=' + ok)
    }
  })


  test('model-serializer-mutated-values', async () => {
    const dir = GEN + '/ex-serializer'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aontu', 'a: 1\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aontu',
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
    await writeFile(dir + '/m.aontu', 'top: @"./missing.aontu"\n')

    const b = makeBuild({
      fs: Fs, base: dir, path: dir + '/m.aontu', res: [],
    }, silentLog())

    const v = await b.run({ watch: false })
    assert.strictEqual(v.ok, false)
    assert.ok(0 < v.errs.length)
  })


  // A project still on model-config.aon is moved to model-config.aontu: the
  // file is renamed and each .aon include points at .aontu, in any quote
  // style, with every other byte kept.
  test('legacy-config-migrates-forward', async () => {
    const dir = GEN + '/ex-migrate'
    const cdir = dir + '/model/.model-config'
    await rm(dir, { recursive: true, force: true })
    await mkdir(cdir, { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')
    await writeFile(cdir + '/local.aontu', 'sys: model: local: true\n')
    await writeFile(cdir + '/model-config.aon', LEGACY_CONFIG)

    const model = new Model({
      fs: Fs, path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent',
    } as any)
    const br = await model.run()

    assert.ok(br.ok, 'migrated config did not build: ' + errtext(br.errs))
    assert.strictEqual(Fs.existsSync(cdir + '/model-config.aon'), false,
      'the legacy config should be gone once migrated')
    assert.strictEqual(await readFile(cdir + '/model-config.aontu', 'utf8'),
      MIGRATED_CONFIG)

    const config = JSON.parse(await readFile(cdir + '/model-config.json', 'utf8'))
    assert.strictEqual(config.sys.model.local, true)
    assert.strictEqual(config.sys.model.was,
      '@voxgig/model/model/.model-config/model-config.aon')
  })


  test('aontu-config-wins-over-legacy', async () => {
    const dir = GEN + '/ex-migrate-both'
    const cdir = dir + '/model/.model-config'
    await rm(dir, { recursive: true, force: true })
    await mkdir(cdir, { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')
    await writeFile(cdir + '/model-config.aon', 'sys: model: which: aon\n')
    await writeFile(cdir + '/model-config.aontu', 'sys: model: which: aontu\n')

    const model = new Model({
      fs: Fs, path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent',
    } as any)
    const br = await model.run()

    assert.ok(br.ok, errtext(br.errs))
    assert.strictEqual(await readFile(cdir + '/model-config.aon', 'utf8'),
      'sys: model: which: aon\n')
    assert.strictEqual(await readFile(cdir + '/model-config.aontu', 'utf8'),
      'sys: model: which: aontu\n')
    const config = JSON.parse(await readFile(cdir + '/model-config.json', 'utf8'))
    assert.strictEqual(config.sys.model.which, 'aontu')
  })


  test('missing-config-is-created-as-aontu', async () => {
    const dir = GEN + '/ex-config-new'
    const cdir = dir + '/model/.model-config'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model', { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')

    const model = new Model({
      fs: Fs, path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent',
    } as any)
    const br = await model.run()

    assert.ok(br.ok, errtext(br.errs))
    assert.ok((await readFile(cdir + '/model-config.aontu', 'utf8')).includes(
      '@"@voxgig/model/model/.model-config/model-config.aontu"'))
    assert.strictEqual(Fs.existsSync(cdir + '/model-config.aon'), false)
  })


  // A dry run migrates in memory: the build uses the migrated config and
  // nothing on disk changes.
  test('dryrun-migrates-legacy-config-in-memory', async () => {
    const dir = GEN + '/ex-migrate-dry'
    const cdir = dir + '/model/.model-config'
    await rm(dir, { recursive: true, force: true })
    await mkdir(cdir, { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')
    await writeFile(cdir + '/local.aontu', 'sys: model: local: true\n')
    await writeFile(cdir + '/model-config.aon', LEGACY_CONFIG)

    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent', dryrun: true,
    } as any)
    const br = await model.run()

    assert.ok(br.ok, 'dry run did not build: ' + errtext(br.errs))
    assert.strictEqual(await readFile(cdir + '/model-config.aon', 'utf8'),
      LEGACY_CONFIG)
    assert.strictEqual(Fs.existsSync(cdir + '/model-config.aontu'), false)
    assert.strictEqual(Fs.existsSync(cdir + '/model-config.json'), false)
    assert.strictEqual(model.config?.watch.build?.model.sys.model.local, true)
  })


  test('dryrun-creates-missing-config-in-memory', async () => {
    const dir = GEN + '/ex-config-dry'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model', { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')

    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent', dryrun: true,
    } as any)
    const br = await model.run()

    assert.ok(br.ok, 'dry run did not build: ' + errtext(br.errs))
    assert.strictEqual(Fs.existsSync(dir + '/model/.model-config'), false)
    assert.strictEqual(Fs.existsSync(dir + '/model/model.json'), false)
  })


  test('dryrun-config-is-served-back-by-resolved-path', () => {
    const at = GEN + '/ex-readback/model/.model-config/model-config.aontu'
    const fs = readBack(Fs, GEN + '/ex-readback/model/x/../.model-config/model-config.aontu', () => 'x: 1\n')

    assert.strictEqual(fs.readFileSync(at, 'utf8'), 'x: 1\n')
    assert.strictEqual(String(fs.readFileSync(Path.resolve(at))), 'x: 1\n')
    assert.strictEqual(typeof fs.statSync(at).mtimeMs, 'number')
    assert.throws(() => fs.readFileSync(GEN + '/ex-readback/absent.aontu', 'utf8'))
  })


  test('dryrun-watch-starts-with-config-in-memory', async () => {
    const dir = GEN + '/ex-config-dry-watch'
    const cdir = dir + '/model/.model-config'
    await rm(dir, { recursive: true, force: true })
    await mkdir(cdir, { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')
    await writeFile(cdir + '/local.aontu', 'sys: model: local: true\n')
    await writeFile(cdir + '/model-config.aon', LEGACY_CONFIG)

    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent', dryrun: true,
    } as any)
    try {
      const failed: any = await model.start()
      assert.strictEqual(failed, undefined,
        'dry run did not start: ' + errtext(failed?.errs))
      assert.strictEqual(await readFile(cdir + '/model-config.aon', 'utf8'),
        LEGACY_CONFIG)
      assert.strictEqual(Fs.existsSync(cdir + '/model-config.aontu'), false)
    }
    finally {
      await model.stop()
    }
  })


  // A dry run keeps no snapshot of a legacy config: each config build
  // re-derives it from model-config.aon.
  test('dryrun-rerun-reads-legacy-config-edits', async () => {
    const { dir, cdir } = await flagProject('ex-dry-rerun')
    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent', dryrun: true,
    } as any)

    assert.ok((await model.run()).ok)
    assert.strictEqual(configFlag(model), 1)

    await editLater(cdir + '/model-config.aon', FLAG_CONFIG(2))
    const br = await model.run()

    assert.ok(br.ok, errtext(br.errs))
    assert.strictEqual(configFlag(model), 2)
    assert.strictEqual(Fs.existsSync(cdir + '/model-config.aontu'), false)
  })


  test('dryrun-watch-rebuilds-on-legacy-config-edit', async () => {
    const { dir, cdir } = await flagProject('ex-dry-watch-edit')
    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model',
      debug: 'silent', dryrun: true,
    } as any)

    try {
      const failed: any = await model.start()
      assert.strictEqual(failed, undefined, errtext(failed?.errs))
      assert.strictEqual(configFlag(model), 1)

      await sleep(500)
      await editLater(cdir + '/model-config.aon', FLAG_CONFIG(2))

      for (let i = 0; i < 80 && 2 !== configFlag(model); i++) {
        await sleep(100)
      }
      assert.strictEqual(configFlag(model), 2)
      assert.strictEqual(Fs.existsSync(cdir + '/model-config.aontu'), false)
    }
    finally {
      await model.stop()
    }
  })


  // Only a missing legacy file means there is none. One that cannot be read
  // fails the config build, and no default is written over it.
  test('unreadable-legacy-config-fails-and-writes-nothing', async () => {
    const dir = GEN + '/ex-legacy-unreadable'
    const cdir = dir + '/model/.model-config'
    await rm(dir, { recursive: true, force: true })
    await mkdir(cdir + '/model-config.aon', { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\n')

    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model', debug: 'silent',
    } as any)
    const br = await model.run()

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /model config: cannot read .*model-config\.aon/)
    assert.strictEqual(Fs.existsSync(cdir + '/model-config.aontu'), false)
    assert.strictEqual(Fs.existsSync(dir + '/model/model.json'), false)
  })


  test('legacy-config-read-error-is-reported', async () => {
    const { cdir } = await flagProject('ex-legacy-eacces')
    const denied = {
      ...Fs,
      readFileSync: (p: any, ...rest: any[]) => String(p).endsWith('.aon') ?
        (() => { throw Object.assign(new Error('EACCES: permission denied'),
          { code: 'EACCES' }) })() :
        (Fs.readFileSync as any)(p, ...rest),
    }

    const prep = prepareConfig(denied, cdir, silentLog())

    assert.strictEqual((prep.err as any)?.code, 'EACCES')
    assert.deepStrictEqual(Fs.readdirSync(cdir).sort(),
      ['local.aontu', 'model-config.aon'])
  })


  // A write that fails part way leaves no model-config.aontu, which would
  // otherwise take precedence over the intact legacy file on the next run.
  test('failed-config-write-leaves-no-partial-file', async () => {
    const { dir, cdir } = await flagProject('ex-write-partial')
    const full = {
      ...Fs,
      writeFileSync: (p: any, data: any) => {
        Fs.writeFileSync(p, String(data).slice(0, 7))
        throw Object.assign(new Error('ENOSPC: no space left on device'),
          { code: 'ENOSPC' })
      },
    }

    const prep = prepareConfig(full, cdir, silentLog())

    assert.strictEqual((prep.err as any)?.code, 'ENOSPC')
    assert.deepStrictEqual(Fs.readdirSync(cdir).sort(),
      ['local.aontu', 'model-config.aon'])
    assert.strictEqual(await readFile(cdir + '/model-config.aon', 'utf8'),
      FLAG_CONFIG(1))

    const model = new Model({
      path: dir + '/model/model.aontu', base: dir + '/model', debug: 'silent',
    } as any)
    const br = await model.run()
    assert.ok(br.ok, errtext(br.errs))
    assert.strictEqual(configFlag(model), 1)
    assert.deepStrictEqual(Fs.readdirSync(cdir).sort(),
      ['local.aontu', 'model-config.aontu', 'model-config.json'])
  })

})
