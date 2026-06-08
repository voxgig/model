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

    await writeFile(dir + '/model/model.jsonic', 'top: 1\n')
    await writeFile(dir + '/model/.model-config/model-config.jsonic',
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
      [BIN, dir + '/model/model.jsonic', '-b', '{outer:{inner:VAL}}'],
      { encoding: 'utf8' })

    assert.strictEqual(res.status, 0,
      'cli should exit 0\nstdout:' + res.stdout + '\nstderr:' + res.stderr)

    const args = JSON.parse(await readFile(out, 'utf8'))
    assert.deepStrictEqual(args, { outer: { inner: 'VAL' } })
  })

})
