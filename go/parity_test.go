/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

// Shared cross-language parity specs (top-level test/spec/*.tsv).
//
// Each row is (name, args, expected): args is [aontuSrc] and expected is the
// exact bytes of the model.json the build must write — object keys sorted,
// two-space indent, HTML characters literal, no trailing newline. The same
// fixtures drive the TypeScript suite (ts/test/parity.test.ts), so a
// behavioural drift between the two implementations fails one of them. Spec
// files are auto-discovered: add a .tsv under test/spec/ and both suites pick
// it up.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

type specRow struct {
	name     string
	args     []any
	expected any
}

func loadSpec(t *testing.T, path string) []specRow {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read spec %s: %v", path, err)
	}
	var rows []specRow
	for i, line := range strings.Split(string(data), "\n") {
		if i == 0 || strings.TrimSpace(line) == "" || strings.HasPrefix(line, "#") {
			continue // line 0 is the header (name/args/expected)
		}
		cols := strings.SplitN(line, "\t", 3)
		var args []any
		var exp any
		if err := json.Unmarshal([]byte(cols[1]), &args); err != nil {
			t.Fatalf("%s/%s args: %v", path, cols[0], err)
		}
		if err := json.Unmarshal([]byte(cols[2]), &exp); err != nil {
			t.Fatalf("%s/%s expected: %v", path, cols[0], err)
		}
		rows = append(rows, specRow{cols[0], args, exp})
	}
	return rows
}

// buildModelJSON runs ModelProducer over src and returns the written JSON.
func buildModelJSON(t *testing.T, src string) string {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "model.aon")
	writeFile(t, dir, "model.aon", src)

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

// TestSharedSpecs runs every test/spec/*.tsv row: model.json output must be
// byte-for-byte identical to the TypeScript implementation, which generated
// the expected values. No t.Parallel: AontuResolver chdirs to the model base.
func TestSharedSpecs(t *testing.T) {
	files, err := filepath.Glob(filepath.Join("..", "test", "spec", "*.tsv"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("no shared spec files in ../test/spec")
	}
	sort.Strings(files)

	for _, file := range files {
		group := strings.TrimSuffix(filepath.Base(file), ".tsv")
		t.Run(group, func(t *testing.T) {
			for _, row := range loadSpec(t, file) {
				t.Run(row.name, func(t *testing.T) {
					src, _ := row.args[0].(string)
					exp, _ := row.expected.(string)
					if got := buildModelJSON(t, src); got != exp {
						t.Fatalf("model.json parity mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, exp)
					}
				})
			}
		})
	}
}
