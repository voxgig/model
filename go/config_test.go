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
	writeFile(t, dir, "model.aon", "x: 1\n")

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aon"), Base: dir})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config", "model-config.aon")); err != nil {
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
	writeFile(t, dir, "model.aon", "x: 1\n")

	disabled := false
	m := New(ModelSpec{
		Path:   filepath.Join(dir, "model.aon"),
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
	writeFile(t, mdir, "model.aon", "x: 1\n")
	writeFile(t, cdir, "model-config.aon",
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
		Path:    filepath.Join(mdir, "model.aon"),
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
	writeFile(t, mdir, "model.aon", "x: 1\n")
	writeFile(t, cdir, "model-config.aon",
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
		Path:    filepath.Join(mdir, "model.aon"),
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
	writeFile(t, mdir, "model.aon", "x: 1\n")
	// Two actions, declared out of order and with no order.action -> the
	// producer should run them by sorted key (a,b).
	writeFile(t, cdir, "model-config.aon",
		"sys: model: action: { b: load: 'y', a: load: 'x' }\n")

	var order []string
	mk := func(n string) ActionDef {
		return ActionDef{Run: func(_ map[string]any, _ *Build, _ *BuildContext) ActionResult {
			order = append(order, n)
			return ActionResult{OK: true}
		}}
	}
	m := New(ModelSpec{
		Path:    filepath.Join(mdir, "model.aon"),
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

// A legacy .model-config/model-config.aontu is migrated to .aon, and THIS
// package's own config import is retargeted on the way. The package config
// moved to .aon in v10, so a verbatim copy would leave the migrated config
// importing a file that no longer ships. Mirrors the TypeScript
// legacy-config-migrates-with-package-import-retargeted.
//
// The assertion is on the migrated bytes, not on a successful build: the Go
// aontu engine does not resolve npm package imports at all (which is why
// configStub is self-contained), so building one would fail for an unrelated
// reason in either direction.
func TestConfigLegacyMigrationRetargetsPackageImport(t *testing.T) {
	dir := t.TempDir()
	cdir := filepath.Join(dir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, dir, "model.aon", "x: 1\n")
	writeFile(t, cdir, "model-config.aontu",
		"@\"@voxgig/model/model/.model-config/model-config.aontu\"\n"+
			"@\"local.aontu\"\n"+
			"sys: model: action: {}\n"+
			"sys: model: was: '@voxgig/model/model/.model-config/model-config.aontu'\n")

	New(ModelSpec{Path: filepath.Join(dir, "model.aon"), Base: dir})

	if _, err := os.Stat(filepath.Join(cdir, "model-config.aontu")); !os.IsNotExist(err) {
		t.Fatalf("legacy config should be gone once migrated (err=%v)", err)
	}
	got, err := os.ReadFile(filepath.Join(cdir, "model-config.aon"))
	if err != nil {
		t.Fatalf("migrated config not written: %v", err)
	}
	migrated := string(got)

	if !strings.Contains(migrated, "@voxgig/model/model/.model-config/model-config.aon\"") {
		t.Fatalf("package import should name .aon, got:\n%s", migrated)
	}
	// The rewrite is anchored to aontu's `@"..."` import syntax, so this same
	// pathname held as ordinary string DATA is left exactly as it was. A bare
	// pathname match would silently edit a declaration during a one-time
	// migration. (Reported by Codex review on voxgig/model#16.)
	if !strings.Contains(migrated,
		"was: '@voxgig/model/model/.model-config/model-config.aontu'") {
		t.Fatalf("a path held as string data must be left alone, got:\n%s", migrated)
	}
	// A project's OWN .aontu import still names a real file on disk, so the
	// migration must leave it exactly as it found it.
	if !strings.Contains(migrated, "@\"local.aontu\"") {
		t.Fatalf("a project's own .aontu import must be left alone, got:\n%s", migrated)
	}
	// The declarations the migration exists to preserve are still there.
	if !strings.Contains(migrated, "sys: model: action: {}") {
		t.Fatalf("declared content lost in migration, got:\n%s", migrated)
	}
}
