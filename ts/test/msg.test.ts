/* Copyright © 2026 Voxgig Ltd, MIT License. */

// Message declaration checks (ts/src/producer/msg.ts).
//
// Error behaviour, so per-language rather than a shared test/spec row; the Go
// suite mirrors these in go/msg_test.go. Sources here use plain aontu (no
// aliases or close()), because the checks read the RESOLVED model and must
// hold whatever the source used to express it.

import Fs from 'node:fs'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { Model } from '../dist/model'
import { model_producer } from '../dist/producer/model'
import { msg_producer, checkMsg } from '../dist/producer/msg'
import type { BuildContext } from '../dist/types'


const GEN = __dirname + '/../test/_gen'

function silentLog() {
  return prettyPino('test', { debug: 'silent' })
}

function errtext(errs: any[]) {
  return (errs || []).map((e: any) => e && (e.msg || e.message) || String(e)).join(' | ')
}


// Build src through the msg check and the model producer, as the Model wires
// them: msg first, then model.
async function runMsg(name: string, src: string) {
  const dir = GEN + '/msg-' + name
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(dir + '/m.aon', src)

  const b = makeBuild({
    fs: Fs, base: dir, path: dir + '/m.aon',
    res: [
      { path: '/', build: msg_producer },
      { path: '/', build: model_producer },
    ],
  }, silentLog())

  const br = await b.run({ watch: false })
  return { br, dir, json: dir + '/m.json' }
}


describe('msg', () => {

  // === the declared shape: a list ===

  test('valid-list-builds', async () => {
    const { br, json } = await runMsg('valid',
      'main: msg: [\n' +
      '  { pat: [ {aim: web}, {save: item} ], doc: "Save an item" }\n' +
      ']\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.ok(existsSync(json))
  })


  // THE REASON THE SHAPE IS A LIST. A gateway proxy and the message it
  // forwards to share their last pattern pair, so any key derived from that
  // pair collides. A list has no key.
  test('gateway-proxy-and-its-target', async () => {
    const { br } = await runMsg('proxy',
      'main: msg: [\n' +
      '  { pat: [ {aim: todo}, {save: item} ] }\n' +
      '  { pat: [ {aim: web}, {on: todo}, {save: item} ], file: "./web_save_item" }\n' +
      ']\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  test('multiple-definitions-build', async () => {
    const { br } = await runMsg('multi',
      'main: msg: [\n' +
      '  { pat: [ {aim: web}, {save: item} ] }\n' +
      '  { pat: [ {aim: web}, {load: item} ] }\n' +
      '  { pat: [ {aim: cag}, {publish: fixture} ] }\n' +
      ']\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // A one-pair pattern is legal.
  test('single-pair-pattern', async () => {
    const { br } = await runMsg('single', 'main: msg: [ { pat: [ {get: info} ] } ]\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  test('empty-list-builds', async () => {
    const { br } = await runMsg('emptylist', 'main: msg: []\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // === backwards compatibility ===

  test('legacy-chain-untouched', async () => {
    const { br, json } = await runMsg('legacy',
      'main: msg: aim: web: {\n' +
      '  get: info: {}\n' +
      "  on: todo: { save: item: { '$': { file: './web_save_item' } } }\n" +
      '}\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.ok(existsSync(json))
  })


  test('no-messages', async () => {
    const { br } = await runMsg('none', 'main: entity: item: { name: "item" }\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // A legacy pattern pair spelled `pat:` is a chain node - its value is a map,
  // not a list - so it is not mistaken for a definition.
  test('legacy-pat-key-is-not-a-definition', async () => {
    const { br } = await runMsg('legacy-pat', 'main: msg: pat: web: { save: item: {} }\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // A definition among chain nodes is reported, not walked: the nested walk
  // would read its metadata keys as pattern pairs.
  test('definition-in-a-chain-is-rejected', async () => {
    const { br, json } = await runMsg('keyed',
      'main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg "save_item": a message definition must be declared in the main\.msg list/)
    assert.strictEqual(existsSync(json), false)
  })


  // === duplicate patterns ===

  test('duplicate-pat-fails', async () => {
    const { br } = await runMsg('dup',
      'main: msg: [\n' +
      '  { pat: [ {aim: web}, {save: item} ] }\n' +
      '  { pat: [ {aim: web}, {save: item} ], doc: "again" }\n' +
      ']\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg \[1\]: pat \[aim:web,save:item\] is already declared by msg \[0\]/)
  })


  // Same pairs in a different order are different patterns.
  test('reordered-pat-is-distinct', async () => {
    const { br } = await runMsg('reorder',
      'main: msg: [\n' +
      '  { pat: [ {aim: web}, {save: item} ] }\n' +
      '  { pat: [ {save: item}, {aim: web} ] }\n' +
      ']\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // === malformed definitions ===

  test('empty-pat-fails', async () => {
    const { br } = await runMsg('emptypat', 'main: msg: [ { pat: [] } ]\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /model msg \[0\]: pat declares no pattern pairs/)
  })


  test('missing-pat-fails', async () => {
    const { br } = await runMsg('nopat', 'main: msg: [ { doc: "no pattern" } ]\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /model msg \[0\]: has no pat list/)
  })


  test('multi-key-pair-fails', async () => {
    const { br } = await runMsg('multikey',
      'main: msg: [ { pat: [ {aim: web, save: item} ] } ]\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg \[0\]: pat pair 0 is not a single key:value pair/)
  })


  test('non-string-pair-value-fails', async () => {
    const { br } = await runMsg('nonstring',
      'main: msg: [ { pat: [ {aim: web}, {save: 1} ] } ]\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg \[0\]: pat pair 1 \(save\) value is not a string/)
  })


  test('non-string-file-fails', async () => {
    const { br } = await runMsg('badfile',
      'main: msg: [ { pat: [ {aim: web}, {save: item} ], file: 1 } ]\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /model msg \[0\]: file is not a string/)
  })


  // === checkMsg unit cases (shapes aontu source cannot easily express) ===

  test('checkMsg-tolerates-non-model-shapes', () => {
    assert.deepStrictEqual(checkMsg(undefined), [])
    assert.deepStrictEqual(checkMsg(null), [])
    assert.deepStrictEqual(checkMsg({}), [])
    assert.deepStrictEqual(checkMsg({ main: 'nope' }), [])
    assert.deepStrictEqual(checkMsg({ main: {} }), [])
    assert.deepStrictEqual(checkMsg({ main: { msg: 'nope' } }), [])
    assert.deepStrictEqual(checkMsg({ main: { msg: [] } }), [])
    assert.deepStrictEqual(checkMsg({ main: { msg: {} } }), [])
  })


  test('checkMsg-rejects-non-definition-elements', () => {
    assert.deepStrictEqual(
      checkMsg({ main: { msg: ['nope'] } }),
      ['model msg [0]: is not a message definition'])

    assert.deepStrictEqual(
      checkMsg({ main: { msg: [null] } }),
      ['model msg [0]: is not a message definition'])

    assert.deepStrictEqual(
      checkMsg({ main: { msg: [[]] } }),
      ['model msg [0]: is not a message definition'])
  })


  test('checkMsg-rejects-non-map-pat-element', () => {
    for (const elem of ['aim:web', [], {}]) {
      assert.deepStrictEqual(
        checkMsg({ main: { msg: [{ pat: [elem] }] } }),
        ['model msg [0]: pat pair 0 is not a single key:value pair'])
    }
  })


  // A malformed pair stops that definition's remaining checks.
  test('checkMsg-reports-one-problem-per-broken-pattern', () => {
    assert.deepStrictEqual(
      checkMsg({ main: { msg: [{ pat: [{ save: 1 }], file: 2 }] } }),
      ['model msg [0]: pat pair 0 (save) value is not a string'])
  })


  // Problems come out in list order, which is the same in both
  // implementations - no sorting needed, unlike map keys.
  test('checkMsg-orders-problems-by-index', () => {
    assert.deepStrictEqual(checkMsg({
      main: {
        msg: [
          { pat: [{ a: 'b' }] },
          { pat: [] },
          { pat: [{ a: 'b' }] },
        ]
      }
    }), [
      'model msg [1]: pat declares no pattern pairs',
      'model msg [2]: pat [a:b] is already declared by msg [0]',
    ])
  })


  // Pattern identity is structural, not a rendering of it: a value carrying
  // the delimiters used to display a pattern must not collide with a
  // genuinely different pattern.
  test('delimiters-in-values-do-not-collide', () => {
    assert.deepStrictEqual(checkMsg({
      main: {
        msg: [
          { pat: [{ a: 'b,c:d' }] },
          { pat: [{ a: 'b' }, { c: 'd' }] },
        ]
      }
    }), [])
  })


  // Two definitions in a chain are reported in byte order of the key, so both
  // implementations agree (Go map iteration is otherwise random).
  test('definitions-in-a-chain-are-ordered', () => {
    const why = ': a message definition must be declared in the main.msg list' +
      ', not as a keyed entry (main: msg: [ { pat: [...] } ])'

    assert.deepStrictEqual(checkMsg({
      main: {
        msg: {
          zz: { pat: [{ a: 'b' }] },
          aa: { pat: [{ a: 'b' }] },
        }
      }
    }), [
      'model msg "aa"' + why,
      'model msg "zz"' + why,
    ])
  })


  // === producer mechanics ===

  // The check runs in both phases. It has to: a pre action can request a
  // reload, and the build re-resolves the model after the pre phase, so a
  // pre-only check would let the regenerated model through unchecked.
  test('producer-checks-in-post-too', async () => {
    const build: any = {
      model: { main: { msg: [{ pat: [] }] } },
      errs: [],
      log: silentLog(),
    }
    const ctx: BuildContext = { step: 'post', watch: false, state: {} }

    const pr = await msg_producer(build, ctx)

    assert.strictEqual(pr.ok, false)
    assert.match(errtext(pr.errs), /pat declares no pattern pairs/)
  })


  test('producer-reports-errors-on-build-and-result', async () => {
    const build: any = {
      model: { main: { msg: [{ pat: [] }] } },
      errs: [],
      log: silentLog(),
    }
    const ctx: BuildContext = { step: 'pre', watch: false, state: {} }

    const pr = await msg_producer(build, ctx)

    assert.strictEqual(pr.ok, false)
    assert.strictEqual(pr.errs.length, 1)
    assert.ok(pr.errs[0] instanceof Error)
    assert.deepStrictEqual(build.errs, pr.errs)
  })


  // The real reload path: a pre producer rewrites the model source and asks
  // for a reload, turning a valid model into an invalid one.
  test('reloaded-model-is-rechecked', async () => {
    const dir = GEN + '/msg-reload'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })

    const path = dir + '/m.aon'
    await writeFile(path, 'main: msg: [ { pat: [ {aim: web}, {save: item} ] } ]\n')

    let rewritten = false

    const b = makeBuild({
      fs: Fs, base: dir, path,
      res: [
        { path: '/', build: msg_producer },
        { path: '/', build: model_producer },
        {
          path: '/', build: async function rewrite(_build: any, ctx: BuildContext) {
            const pr = {
              ok: true, name: 'rewrite', step: ctx.step, active: true,
              reload: false, errs: [], runlog: [],
            }
            if ('pre' === ctx.step && !rewritten) {
              rewritten = true
              Fs.writeFileSync(path, 'main: msg: [ { pat: [] } ]\n')
              // Force a distinct mtime: resolveModel caches on it, and the
              // rewrite can land inside the same millisecond as the original.
              const future = new Date(Date.now() + 2000)
              Fs.utimesSync(path, future, future)
              pr.reload = true
            }
            return pr
          }
        },
      ],
    }, silentLog())

    const br = await b.run({ watch: false })

    assert.ok(rewritten, 'the rewrite producer did not run')
    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /model msg \[0\]: pat declares no pattern pairs/)
    assert.strictEqual(existsSync(dir + '/m.json'), false)
  })


  // === wired into the Model ===

  test('model-runs-the-check', async () => {
    const dir = GEN + '/msg-model'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon', 'main: msg: [ { pat: [] } ]\n')

    const model = new Model({
      path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
    })
    const br = await model.run()

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /pat declares no pattern pairs/)
    assert.strictEqual(existsSync(dir + '/m.json'), false)
  })


  test('model-builds-a-valid-declaration', async () => {
    const dir = GEN + '/msg-model-ok'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon',
      'main: msg: [ { pat: [ {aim: web}, {save: item} ] } ]\n')

    const model = new Model({
      path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.ok(existsSync(dir + '/m.json'))
  })

})
