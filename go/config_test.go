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
	writeFile(t, dir, "model.aontu", "x: 1\n")

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config", "model-config.aontu")); err != nil {
		t.Fatalf("config file not auto-created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config", "model-config.json")); err != nil {
		t.Fatalf("model-config.json not written: %v", err)
	}
	if m.Config().Model() == nil {
		t.Fatal("config model not resolved")
	}
}

// With config disabled, New skips the .model-config build entirely: nothing is
// auto-created, Config() is nil, but the model is still written.
func TestConfigDisabled(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "model.aontu", "x: 1\n")

	disabled := false
	m := New(ModelSpec{
		Path:   filepath.Join(dir, "model.aontu"),
		Base:   dir,
		Config: &disabled,
	})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config")); !os.IsNotExist(err) {
		t.Fatalf(".model-config should not be created when config is disabled (err=%v)", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "model.json")); err != nil {
		t.Fatalf("model.json not written: %v", err)
	}
	if m.Config() != nil {
		t.Fatal("Config() should be nil when config is disabled")
	}
}

// With config disabled, the action order falls back to the spec's Order even
// when a .model-config file is present (it is ignored).
func TestConfigDisabledIgnoresFileUsesOrder(t *testing.T) {
	dir := t.TempDir()
	mdir := filepath.Join(dir, "model")
	cdir := filepath.Join(mdir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, mdir, "model.aontu", "x: 1\n")
	writeFile(t, cdir, "model-config.aontu",
		"sys: model: action: { a: load: 'x', b: load: 'y' }\n"+
			"sys: model: order: action: 'b,a'\n")

	var order []string
	mk := func(n string) ActionDef {
		return ActionDef{Run: func(_ map[string]any, _ *Build, _ *BuildContext) ActionResult {
			order = append(order, n)
			return ActionResult{OK: true}
		}}
	}
	disabled := false
	m := New(ModelSpec{
		Path:    filepath.Join(mdir, "model.aontu"),
		Base:    mdir,
		Config:  &disabled,
		Actions: map[string]ActionDef{"a": mk("a"), "b": mk("b")},
		Order:   []string{"a", "b"},
	})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	// Spec Order wins (a,b); the config file's order (b,a) is ignored.
	if strings.Join(order, ",") != "a,b" {
		t.Fatalf("action order = %v, want [a b] (from spec Order, config ignored)", order)
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
	writeFile(t, mdir, "model.aontu", "x: 1\n")
	writeFile(t, cdir, "model-config.aontu",
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
		Path:    filepath.Join(mdir, "model.aontu"),
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

// When the config declares actions but no explicit sys.model.order.action, the
// run order falls back to the sorted action keys.
func TestConfigOrderFallsBackToSortedKeys(t *testing.T) {
	dir := t.TempDir()
	mdir := filepath.Join(dir, "model")
	cdir := filepath.Join(mdir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, mdir, "model.aontu", "x: 1\n")
	// Two actions, declared out of order and with no order.action -> the
	// producer should run them by sorted key (a,b).
	writeFile(t, cdir, "model-config.aontu",
		"sys: model: action: { b: load: 'y', a: load: 'x' }\n")

	var order []string
	mk := func(n string) ActionDef {
		return ActionDef{Run: func(_ map[string]any, _ *Build, _ *BuildContext) ActionResult {
			order = append(order, n)
			return ActionResult{OK: true}
		}}
	}
	m := New(ModelSpec{
		Path:    filepath.Join(mdir, "model.aontu"),
		Base:    mdir,
		Actions: map[string]ActionDef{"a": mk("a"), "b": mk("b")},
	})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if strings.Join(order, ",") != "a,b" {
		t.Fatalf("action order = %v, want [a b] (sorted action keys)", order)
	}
}
