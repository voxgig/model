/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { test, describe } from 'node:test'
import assert from 'node:assert'


const GEN = __dirname + '/../test/_gen'
const BIN = __dirname + '/../bin/voxgig-model'


describe('cli', () => {

  // The -b/--build flag is parsed into buildargs; confirm those args actually
  // reach a build action via the real CLI entry point.
  test('passes-build-args', async () => {
    const dir = GEN + '/cli01'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model/.model-config', { recursive: true })
    await mkdir(dir + '/build', { recursive: true })

    await writeFile(dir + '/model/model.aontu', 'top: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.aontu',
      "sys: model: action: { recordargs: load: 'build/recordargs' }\n")
    await writeFile(dir + '/build/recordargs.js',
      "const Path = require('node:path')\n" +
      'module.exports = async function recordargs(model, build) {\n' +
      "  const root = Path.resolve(build.path, '..', '..')\n" +
      "  build.fs.writeFileSync(Path.resolve(root, 'args-out.json'),\n" +
      '    JSON.stringify(build.args ?? null))\n' +
      '  return { ok: true }\n' +
      '}\n')

    const out = dir + '/args-out.json'
    await rm(out, { force: true })

    // No shell: args array avoids cross-platform quoting issues. Barewords
    // keep the jsonic free of embedded quotes.
    const res = spawnSync(process.execPath,
      [BIN, dir + '/model/model.aontu', '-b', '{outer:{inner:VAL}}'],
      { encoding: 'utf8' })

    assert.strictEqual(res.status, 0,
      'cli should exit 0\nstdout:' + res.stdout + '\nstderr:' + res.stderr)

    const args = JSON.parse(await readFile(out, 'utf8'))
    assert.deepStrictEqual(args, { outer: { inner: 'VAL' } })
  })


  // --no-config builds the model without creating .model-config or running any
  // config-declared action.
  test('no-config-skips-config', async () => {
    const { existsSync } = require('node:fs')
    const dir = GEN + '/cli-noconfig'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model', { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'top: 1\n')

    const res = spawnSync(process.execPath,
      [BIN, dir + '/model/model.aontu', '--no-config', '-g', 'silent'],
      { encoding: 'utf8' })

    assert.strictEqual(res.status, 0,
      'cli should exit 0\nstdout:' + res.stdout + '\nstderr:' + res.stderr)
    assert.deepStrictEqual(JSON.parse(await readFile(dir + '/model/model.json', 'utf8')),
      { top: 1 })
    assert.strictEqual(existsSync(dir + '/model/.model-config'), false,
      '--no-config should not create .model-config')
  })


  // A missing model file exits non-zero with a clear message rather than a
  // stack trace.
  test('missing-file-exits-nonzero', async () => {
    const res = spawnSync(process.execPath,
      [BIN, GEN + '/cli-nope/does-not-exist.aontu', '-g', 'silent'],
      { encoding: 'utf8' })

    assert.notStrictEqual(res.status, 0, 'missing file should exit non-zero')
    assert.match(res.stderr, /does not exist/)
  })


  // With no model path, the CLI reports the usage error and exits non-zero
  // rather than trying to build an empty path.
  test('no-args-exits-nonzero', async () => {
    const res = spawnSync(process.execPath, [BIN], { encoding: 'utf8' })

    assert.notStrictEqual(res.status, 0, 'no args should exit non-zero')
    assert.match(res.stderr, /ERROR/)
  })


  // An invalid model (conflicting values) fails the build and exits non-zero.
  test('bad-model-exits-nonzero', async () => {
    const dir = GEN + '/cli-bad'
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir + '/model', { recursive: true })
    await writeFile(dir + '/model/model.aontu', 'x: 1\nx: 2\n')

    const res = spawnSync(process.execPath,
      [BIN, dir + '/model/model.aontu', '--no-config', '-g', 'silent'],
      { encoding: 'utf8' })

    assert.notStrictEqual(res.status, 0, 'invalid model should exit non-zero')
  })

})
