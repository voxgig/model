/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

// Shared cross-language parity specs (top-level test/spec/*.tsv).
//
// Each row is (name, args, expected): args is [aontuSrc] and expected is the
// exact bytes of the model.json the build must write — object keys sorted,
// two-space indent, HTML characters literal, no trailing newline. The same
// fixtures drive the Go suite (go/parity_test.go), so a behavioural drift
// between the two implementations fails one of them. Spec files are
// auto-discovered: add a .tsv under test/spec/ and both suites pick it up.

import Fs from 'fs'
import Path from 'path'

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import { makeBuild } from '../dist/build'
import { model_producer } from '../dist/producer/model'
import { msg_producer } from '../dist/producer/msg'


const SPEC_DIR = Path.join(__dirname, '..', '..', 'test', 'spec')

type SpecRow = { name: string, args: any[], expected: any }

function loadSpec(file: string): SpecRow[] {
  const text = Fs.readFileSync(Path.join(SPEC_DIR, file), 'utf8')
  const rows: SpecRow[] = []
  const lines = text.split('\n')
  // Line 0 is the header (name/args/expected).
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if ('' === line.trim() || line.startsWith('#')) {
      continue
    }
    const t1 = line.indexOf('\t')
    const t2 = line.indexOf('\t', t1 + 1)
    rows.push({
      name: line.slice(0, t1),
      args: JSON.parse(line.slice(t1 + 1, t2)),
      expected: JSON.parse(line.slice(t2 + 1)),
    })
  }
  return rows
}


async function buildModelJson(name: string, src: string): Promise<string> {
  const base = Path.join(__dirname, '..', 'test', '_gen', 'spec', name)
  mkdirSync(base, { recursive: true })
  writeFileSync(Path.join(base, 'model.aon'), src)

  const log = prettyPino('test', {})

  const b = makeBuild({
    fs: Fs,
    base,
    path: Path.join(base, 'model.aon'),
    // As the Model wires them: the msg check first (pre), then the model
    // producer (post). A row therefore asserts both that the source passes
    // the built-in checks and that it serializes to the expected bytes.
    res: [
      { path: '/', build: msg_producer },
      { path: '/', build: model_producer },
    ],
  }, log)

  const r = await b.run({ watch: false })
  assert.ok(r.ok, 'build failed: ' + JSON.stringify(r.errs))

  return readFileSync(Path.join(base, 'model.json'), 'utf8')
}


describe('parity', () => {

  const files = Fs.readdirSync(SPEC_DIR).filter(f => f.endsWith('.tsv')).sort()
  assert.ok(0 < files.length, 'no shared spec files in ' + SPEC_DIR)

  for (const file of files) {
    const group = file.slice(0, -'.tsv'.length)

    describe(group, () => {
      for (const row of loadSpec(file)) {
        test(row.name, async () => {
          assert.strictEqual(
            await buildModelJson(group + '-' + row.name, String(row.args[0])),
            row.expected)
        })
      }
    })
  }

})
