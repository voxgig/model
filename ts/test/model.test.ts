
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
})
