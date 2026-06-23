/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

import Fs from 'fs'
import Path from 'path'

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { test, describe } from 'node:test'
import assert from 'node:assert'

import { prettyPino } from '@voxgig/util'

import type { Build, BuildContext } from '../dist/types'

import { makeBuild } from '../dist/build'
import { model_producer } from '../dist/producer/model'


// The exact bytes both implementations must emit for SRC below. Object keys
// are sorted alphabetically (a, b, html, list, nested; and a before z inside
// nested), arrays keep their order ([3,1,2]), the indent is two spaces, and
// HTML characters are written literally. The identical Go expectation lives in
// go/parity_test.go — keep the two in step.
const EXPECTED = `{
  "a": 1,
  "b": 2,
  "html": "<a> & </a>",
  "list": [
    3,
    1,
    2
  ],
  "nested": {
    "a": "a",
    "z": "z"
  }
}`

// Source keys are deliberately out of alphabetical (insertion) order so the
// test fails if the producer ever stops sorting them.
const SRC = `b: 2
a: 1
nested: { z: "z", a: "a" }
list: [ 3, 1, 2 ]
html: "<a> & </a>"
`


// A second fixture exercising arrays of objects: each element keeps its
// position in the array, but the keys *within* each object are sorted, as are
// the keys of nested objects. HTML characters stay literal. The identical Go
// expectation lives in go/parity_test.go — keep the two in step.
const EXPECTED2 = `{
  "alpha": 1,
  "beta": {
    "x": 1,
    "y": 2
  },
  "nums": [
    30,
    10,
    20
  ],
  "rows": [
    {
      "id": 2,
      "tag": "b<x"
    },
    {
      "id": 1,
      "tag": "a&y"
    }
  ]
}`

const SRC2 = `beta: { y: 2, x: 1 }
alpha: 1
rows: [ { id: 2, tag: "b<x" }, { id: 1, tag: "a&y" } ]
nums: [ 30, 10, 20 ]
`


async function buildModelJson(name: string, src: string): Promise<string> {
  const base = Path.join(__dirname, '..', 'test', '_gen', name)
  mkdirSync(base, { recursive: true })
  writeFileSync(Path.join(base, 'model.jsonic'), src)

  const log = prettyPino('test', {})

  const b = makeBuild({
    fs: Fs,
    base,
    path: Path.join(base, 'model.jsonic'),
    res: [{ path: '/', build: model_producer }],
  }, log)

  const r = await b.run({ watch: false })
  assert.ok(r.ok, 'build failed: ' + JSON.stringify(r.errs))

  return readFileSync(Path.join(base, 'model.json'), 'utf8')
}


describe('parity', () => {

  test('model-output-keys-sorted', async () => {
    assert.strictEqual(await buildModelJson('parity', SRC), EXPECTED)
  })


  test('model-output-array-of-objects', async () => {
    assert.strictEqual(await buildModelJson('parity2', SRC2), EXPECTED2)
  })

})
