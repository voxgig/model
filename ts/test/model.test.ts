
import { test, describe } from 'node:test'
import assert from 'node:assert'

import Fs from 'node:fs'
import Path from 'node:path'
import { spawnSync } from 'node:child_process'


import { Model } from '../dist/model'


describe('model', () => {

  test('happy', () => { })


  // Node prints a runtime deprecation once per process, so each construction
  // runs in a fresh one. Node 24 is the first to deprecate fs.F_OK at runtime.
  test('constructing a Model on the real fs raises no deprecation', () => {
    const base = Path.join(__dirname, '..', 'test', '_gen', 'deprecation')
    Fs.mkdirSync(base, { recursive: true })

    const spec = { path: Path.join(base, 'model.aontu'), base, debug: 'silent', config: false }
    const run = spawnSync(process.execPath, [
      '--throw-deprecation', '-e',
      'const { Model } = require(' + JSON.stringify(require.resolve('../dist/model')) + ')\n' +
      'new Model(' + JSON.stringify(spec) + ')',
    ])

    assert.equal(run.status, 0, String(run.stderr))
  })


  const ACCESS_MODES = ['F_OK', 'R_OK', 'W_OK', 'X_OK'] as const

  function accessModeModel(fs?: any) {
    const base = Path.join(__dirname, '..', 'test', '_gen', 'access-modes')
    Fs.mkdirSync(base, { recursive: true })
    return new Model({ path: Path.join(base, 'model.aontu'), base, debug: 'silent', config: false, fs })
  }


  test('the fs a Model hands its build keeps the access modes', () => {
    const buildFs: any = accessModeModel().build.fs
    for (const mode of ACCESS_MODES) {
      assert.equal(buildFs[mode], Fs.constants[mode], mode)
    }
  })


  // The shape a Node fs has once the access modes are deprecated at runtime,
  // built by hand so every Node version runs it.
  test('an fs whose access modes are hidden getters gets them from its constants', () => {
    const hidden: any = { ...Fs }
    for (const mode of ACCESS_MODES) {
      delete hidden[mode]
      Object.defineProperty(hidden, mode, {
        enumerable: false,
        get: () => { throw new Error(mode + ' getter read') },
      })
    }

    const buildFs: any = accessModeModel(hidden).build.fs
    for (const mode of ACCESS_MODES) {
      assert.equal(buildFs[mode], Fs.constants[mode], mode)
    }
  })
})
