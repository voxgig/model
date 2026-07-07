/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"testing"
)

// parityExpected is the exact bytes both implementations must emit for
// parityModelSrc. Object keys are sorted alphabetically (a, b, html, list,
// nested; and a before z inside nested), arrays keep their order ([3,1,2]),
// the indent is two spaces, and HTML characters are written literally. The
// identical TypeScript expectation lives in ts/test/parity.test.ts — keep the
// two in step.
const parityExpected = `{
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

// Keys are deliberately out of alphabetical (insertion) order so the test fails
// if the producer ever stops sorting them.
const parityModelSrc = `b: 2
a: 1
nested: { z: "z", a: "a" }
list: [ 3, 1, 2 ]
html: "<a> & </a>"
`

// parityExpected2 is a second shared fixture exercising arrays of objects:
// each element keeps its array position, but the keys within each object are
// sorted, as are nested-object keys. HTML characters stay literal. The
// identical TypeScript expectation lives in ts/test/parity.test.ts.
const parityExpected2 = `{
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

const parityModelSrc2 = `beta: { y: 2, x: 1 }
alpha: 1
rows: [ { id: 2, tag: "b<x" }, { id: 1, tag: "a&y" } ]
nums: [ 30, 10, 20 ]
`

// buildModelJSON runs ModelProducer over src and returns the written JSON.
func buildModelJSON(t *testing.T, src string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "model.aontu")
	writeFile(t, dir, "model.aontu", src)

	b := NewBuild(BuildSpec{Path: path, Base: dir,
		Res: []ProducerDef{{Path: "/", Build: ModelProducer}}})
	if br := b.Run(false); !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	data, err := os.ReadFile(filepath.Join(dir, "model.json"))
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

// ModelProducer output is byte-for-byte identical to the TypeScript producer:
// sorted keys, two-space indent, no HTML escaping, no trailing newline.
func TestModelProducerByteParity(t *testing.T) {
	if got := buildModelJSON(t, parityModelSrc); got != parityExpected {
		t.Fatalf("model.json parity mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, parityExpected)
	}
}

// Arrays of objects preserve element order while sorting keys within each
// object, matching the TypeScript producer byte-for-byte.
func TestModelProducerByteParityArrayOfObjects(t *testing.T) {
	if got := buildModelJSON(t, parityModelSrc2); got != parityExpected2 {
		t.Fatalf("model.json parity mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, parityExpected2)
	}
}
