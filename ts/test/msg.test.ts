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
// them: msg first (pre), model second (post).
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

  // === declared shape, valid ===

  test('valid-declaration-builds', async () => {
    const { br, json } = await runMsg('valid',
      'main: msg: save_item: {\n' +
      '  pat: [ {aim: web}, {save: item} ]\n' +
      '  doc: "Save a todo item"\n' +
      '}\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.ok(existsSync(json))
  })


  // Several messages, each with its own pattern, all consistent.
  test('multiple-declarations-build', async () => {
    const { br } = await runMsg('multi',
      'main: msg: {\n' +
      '  save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
      '  load_item: { pat: [ {aim: web}, {load: item} ] }\n' +
      '  publish_fixture: { pat: [ {aim: cag}, {publish: fixture} ] }\n' +
      '}\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // A single-pair pattern is legal: the key is verb_noun of that one pair.
  test('single-pair-pattern', async () => {
    const { br } = await runMsg('single',
      'main: msg: get_info: { pat: [ {get: info} ] }\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // === backwards compatibility ===

  // The legacy nested chain carries no pat list, so it is left alone.
  test('legacy-chain-untouched', async () => {
    const { br, json } = await runMsg('legacy',
      'main: msg: aim: web: {\n' +
      '  get: info: {}\n' +
      "  on: todo: { save: item: { '$': { file: './web_save_item' } } }\n" +
      '}\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.ok(existsSync(json))
  })


  // Both shapes in one model: the chain is skipped, the declaration checked.
  test('mixed-shapes-build', async () => {
    const { br } = await runMsg('mixed',
      'main: msg: {\n' +
      '  aim: web: { save: item: {} }\n' +
      '  publish_fixture: { pat: [ {aim: cag}, {publish: fixture} ] }\n' +
      '}\n')

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // A legacy pattern pair spelled `pat:` is still a chain node - its value is
  // a map, not a list - so the discriminator does not misread it.
  test('legacy-pat-key-not-a-definition', async () => {
    const { br } = await runMsg('legacy-pat',
      'main: msg: pat: web: { save: item: {} }\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // A model with no messages at all builds.
  test('no-messages', async () => {
    const { br } = await runMsg('none', 'main: entity: item: { name: "item" }\n')
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // === key / last-pair consistency ===

  test('key-mismatch-fails', async () => {
    const { br, json } = await runMsg('mismatch',
      'main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg "save_todo": key does not match last pat pair save:item \(expected "save_item"\)/)

    // The check runs in the pre phase, so nothing was written.
    assert.strictEqual(existsSync(json), false)
  })


  // The LAST pair names the key, not the first.
  test('key-from-last-pair-only', async () => {
    const { br } = await runMsg('firstpair',
      'main: msg: aim_web: { pat: [ {aim: web}, {save: item} ] }\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /expected "save_item"/)
  })


  // === duplicate patterns ===

  test('duplicate-pat-fails', async () => {
    const { br } = await runMsg('dup',
      'main: msg: {\n' +
      '  save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
      '  x_save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
      '}\n')

    assert.strictEqual(br.ok, false)
    const text = errtext(br.errs)
    assert.match(text,
      /model msg "x_save_item": pat \[aim:web,save:item\] is already declared by "save_item"/)
  })


  // Same pairs in a different order are different patterns.
  test('reordered-pat-is-distinct', async () => {
    const { br } = await runMsg('reorder',
      'main: msg: {\n' +
      '  save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
      '  aim_web: { pat: [ {save: item}, {aim: web} ] }\n' +
      '}\n')

    // Distinct patterns, and each key matches its own last pair.
    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
  })


  // === malformed patterns ===

  test('empty-pat-fails', async () => {
    const { br } = await runMsg('empty', 'main: msg: save_item: { pat: [] }\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg "save_item": pat declares no pattern pairs/)
  })


  test('multi-key-pair-fails', async () => {
    const { br } = await runMsg('multikey',
      'main: msg: save_item: { pat: [ {aim: web, save: item} ] }\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg "save_item": pat pair 0 is not a single key:value pair/)
  })


  test('non-string-pair-value-fails', async () => {
    const { br } = await runMsg('nonstring',
      'main: msg: save_item: { pat: [ {aim: web}, {save: 1} ] }\n')

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs),
      /model msg "save_item": pat pair 1 \(save\) value is not a string/)
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

    // Entries that are not maps are not declarations.
    assert.deepStrictEqual(checkMsg({ main: { msg: { a: 1, b: null } } }), [])
  })


  test('checkMsg-rejects-non-map-pat-element', () => {
    assert.deepStrictEqual(
      checkMsg({ main: { msg: { save_item: { pat: ['aim:web'] } } } }),
      ['model msg "save_item": pat pair 0 is not a single key:value pair'])

    assert.deepStrictEqual(
      checkMsg({ main: { msg: { save_item: { pat: [[]] } } } }),
      ['model msg "save_item": pat pair 0 is not a single key:value pair'])

    assert.deepStrictEqual(
      checkMsg({ main: { msg: { save_item: { pat: [{}] } } } }),
      ['model msg "save_item": pat pair 0 is not a single key:value pair'])
  })


  // A malformed pair stops that message's checks: no key-mismatch error is
  // piled on top of a pattern that could not be read.
  test('checkMsg-reports-one-problem-per-broken-pattern', () => {
    assert.deepStrictEqual(
      checkMsg({ main: { msg: { wrong_name: { pat: [{ save: 1 }] } } } }),
      ['model msg "wrong_name": pat pair 0 (save) value is not a string'])
  })


  // Problems are reported in byte order of the message name, so the two
  // implementations agree (Go map iteration is otherwise random).
  test('checkMsg-orders-problems-by-name', () => {
    const problems = checkMsg({
      main: {
        msg: {
          zz: { pat: [{ a: 'b' }] },
          aa: { pat: [{ a: 'b' }] },
          mm: { pat: [] },
        }
      }
    })

    assert.deepStrictEqual(problems, [
      'model msg "aa": key does not match last pat pair a:b (expected "a_b")',
      'model msg "mm": pat declares no pattern pairs',
      'model msg "zz": key does not match last pat pair a:b (expected "a_b")',
      'model msg "zz": pat [a:b] is already declared by "aa"',
    ])
  })


  // === producer mechanics ===

  test('producer-is-a-noop-in-post', async () => {
    const build: any = {
      model: { main: { msg: { wrong: { pat: [{ save: 'item' }] } } } },
      errs: [],
      log: silentLog(),
    }
    const ctx: BuildContext = { step: 'post', watch: false, state: {} }

    const pr = await msg_producer(build, ctx)

    assert.strictEqual(pr.ok, true)
    assert.deepStrictEqual(pr.errs, [])
    assert.deepStrictEqual(build.errs, [])
  })


  // A failing check reports its errors both ways: on the result and on the
  // build (BuildImpl.run only collects thrown errors).
  test('producer-reports-errors-on-build-and-result', async () => {
    const build: any = {
      model: { main: { msg: { wrong: { pat: [{ save: 'item' }] } } } },
      errs: [],
      log: silentLog(),
    }
    const ctx: BuildContext = { step: 'pre', watch: false, state: {} }

    const pr = await msg_producer(build, ctx)

    assert.strictEqual(pr.ok, false)
    assert.strictEqual(pr.errs.length, 1)
    assert.ok(pr.errs[0] instanceof Error)
    assert.match(pr.errs[0].message, /expected "save_item"/)
    assert.deepStrictEqual(build.errs, pr.errs)
  })


  // === wired into the Model ===

  test('model-runs-the-check', async () => {
    const dir = GEN + '/msg-model'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon',
      'main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n')

    const model = new Model({
      path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
    })
    const br = await model.run()

    assert.strictEqual(br.ok, false)
    assert.match(errtext(br.errs), /expected "save_item"/)
    assert.strictEqual(existsSync(dir + '/m.json'), false)
  })


  test('model-builds-a-valid-declaration', async () => {
    const dir = GEN + '/msg-model-ok'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    await writeFile(dir + '/m.aon',
      'main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n')

    const model = new Model({
      path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
    })
    const br = await model.run()

    assert.ok(br.ok, 'build failed: ' + errtext(br.errs))
    assert.ok(existsSync(dir + '/m.json'))
  })

})
