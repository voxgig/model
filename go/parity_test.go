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

// ModelProducer output is byte-for-byte identical to the TypeScript producer:
// sorted keys, two-space indent, no HTML escaping, no trailing newline.
func TestModelProducerByteParity(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "model.jsonic")
	writeFile(t, dir, "model.jsonic", parityModelSrc)

	b := NewBuild(BuildSpec{Path: path, Base: dir,
		Res: []ProducerDef{{Path: "/", Build: ModelProducer}}})
	if br := b.Run(false); !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}

	data, err := os.ReadFile(filepath.Join(dir, "model.json"))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != parityExpected {
		t.Fatalf("model.json parity mismatch:\n--- got ---\n%s\n--- want ---\n%s", data, parityExpected)
	}
}
