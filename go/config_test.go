/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// New auto-creates the config file and writes model-config.json.
func TestConfigAutoCreated(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "model.jsonic", "x: 1\n")

	m := New(ModelSpec{Path: filepath.Join(dir, "model.jsonic"), Base: dir})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config", "model-config.jsonic")); err != nil {
		t.Fatalf("config file not auto-created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config", "model-config.json")); err != nil {
		t.Fatalf("model-config.json not written: %v", err)
	}
	if m.Config().Model() == nil {
		t.Fatal("config model not resolved")
	}
}

// The config's sys.model.order.action drives the action run order, overriding
// the registry's default (sorted) order.
func TestConfigDrivesActionOrder(t *testing.T) {
	dir := t.TempDir()
	mdir := filepath.Join(dir, "model")
	cdir := filepath.Join(mdir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, mdir, "model.jsonic", "x: 1\n")
	writeFile(t, cdir, "model-config.jsonic",
		"sys: model: action: { a: load: 'x', b: load: 'y' }\n"+
			"sys: model: order: action: 'b,a'\n")

	var order []string
	mk := func(n string) ActionDef {
		return ActionDef{Run: func(_ map[string]any, _ *Build, _ *BuildContext) ActionResult {
			order = append(order, n)
			return ActionResult{OK: true}
		}}
	}
	m := New(ModelSpec{
		Path:    filepath.Join(mdir, "model.jsonic"),
		Base:    mdir,
		Actions: map[string]ActionDef{"a": mk("a"), "b": mk("b")},
	})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if strings.Join(order, ",") != "b,a" {
		t.Fatalf("action order = %v, want [b a] (from config order.action)", order)
	}
}
