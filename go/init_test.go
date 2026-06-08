/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"testing"
)

// Init scaffolds the starter files, and skips them on a second run.
func TestInitScaffolds(t *testing.T) {
	dir := t.TempDir()

	created, skipped, err := Init(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(created) != 2 || len(skipped) != 0 {
		t.Fatalf("created=%v skipped=%v", created, skipped)
	}
	for _, p := range []string{
		filepath.Join(dir, "model", "model.jsonic"),
		filepath.Join(dir, "model", ".model-config", "model-config.jsonic"),
	} {
		if _, err := os.Stat(p); err != nil {
			t.Fatalf("expected %s to exist: %v", p, err)
		}
	}

	created2, skipped2, err := Init(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(created2) != 0 || len(skipped2) != 2 {
		t.Fatalf("re-init created=%v skipped=%v (should skip existing)", created2, skipped2)
	}
}

// A freshly scaffolded project builds successfully.
func TestInitThenBuild(t *testing.T) {
	dir := t.TempDir()
	if _, _, err := Init(dir); err != nil {
		t.Fatal(err)
	}
	m := New(ModelSpec{
		Path: filepath.Join(dir, "model", "model.jsonic"),
		Base: filepath.Join(dir, "model"),
	})
	if br := m.Run(); !br.OK {
		t.Fatalf("scaffolded model failed to build: %v", br.Errs)
	}
	if m.Build().Model["name"] != "my-model" {
		t.Fatalf("scaffolded model = %#v", m.Build().Model)
	}
}
