/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { Model, initModel } from '../dist/model'


const GEN = __dirname + '/../test/_gen'
const BIN = __dirname + '/../bin/voxgig-model'


describe('init', () => {

  test('scaffolds-and-skips-existing', async () => {
    const dir = GEN + '/init01'
    await rm(dir, { recursive: true, force: true })

    const r1 = initModel(dir, Fs)
    assert.strictEqual(r1.created.length, 2)
    assert.strictEqual(r1.skipped.length, 0)
    await stat(dir + '/model/model.jsonic')
    await stat(dir + '/model/.model-config/model-config.jsonic')

    // Second run leaves existing files untouched.
    const r2 = initModel(dir, Fs)
    assert.strictEqual(r2.created.length, 0)
    assert.strictEqual(r2.skipped.length, 2)
  })


  test('scaffold-builds', async () => {
    const dir = GEN + '/init02'
    await rm(dir, { recursive: true, force: true })
    initModel(dir, Fs)

    const model = new Model({
      path: dir + '/model/model.jsonic', base: dir + '/model', debug: 'silent',
    })
    const br = await model.run()
    assert.ok(br.ok, 'scaffolded model failed: ' + JSON.stringify(br.errs))
  })


  test('cli-init', async () => {
    const dir = GEN + '/init03'
    await rm(dir, { recursive: true, force: true })

    const res = spawnSync(process.execPath, [BIN, 'init', dir], { encoding: 'utf8' })
    assert.strictEqual(res.status, 0, res.stderr)
    assert.ok(res.stdout.includes('created:'), res.stdout)
    await stat(dir + '/model/model.jsonic')
  })

})
