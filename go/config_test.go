/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
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

const legacyConfig = `
@"./local.aon"
@ './shared.aon'

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aon'
# @"./retired.aon"
`

const migratedConfig = `
@"./local.aontu"
@ './shared.aontu'

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aon'
# @"./retired.aon"
`

func legacyProject(t *testing.T) (dir, cdir string) {
	t.Helper()
	dir = t.TempDir()
	cdir = filepath.Join(dir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, dir, "model.aontu", "x: 1\n")
	writeFile(t, cdir, "local.aontu", "sys: model: local: true\n")
	writeFile(t, cdir, "shared.aontu", "sys: model: shared: true\n")
	writeFile(t, cdir, "model-config.aon", legacyConfig)
	return dir, cdir
}

func configValue(m *Model, key string) any {
	sys, _ := m.Config().Model()["sys"].(map[string]any)
	mod, _ := sys["model"].(map[string]any)
	return mod[key]
}

// A project still on model-config.aon is moved to model-config.aontu: the
// file is renamed and each .aon include points at .aontu, in any quote
// style, with every other byte kept.
func TestConfigLegacyMigratesForward(t *testing.T) {
	dir, cdir := legacyProject(t)

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir})
	if br := m.Run(); !br.OK {
		t.Fatalf("migrated config did not build: %v", br.Errs)
	}

	if _, err := os.Stat(filepath.Join(cdir, "model-config.aon")); !os.IsNotExist(err) {
		t.Fatalf("legacy config should be gone once migrated (err=%v)", err)
	}
	got, err := os.ReadFile(filepath.Join(cdir, "model-config.aontu"))
	if err != nil {
		t.Fatalf("migrated config not written: %v", err)
	}
	if string(got) != migratedConfig {
		t.Fatalf("migrated config:\n%s\nwant:\n%s", got, migratedConfig)
	}
	if configValue(m, "local") != true || configValue(m, "shared") != true {
		t.Fatalf("migrated includes did not resolve: %#v", m.Config().Model())
	}
	if configValue(m, "was") != "@voxgig/model/model/.model-config/model-config.aon" {
		t.Fatalf("string data changed: %#v", configValue(m, "was"))
	}
}

func TestConfigAontuWinsOverLegacy(t *testing.T) {
	dir := t.TempDir()
	cdir := filepath.Join(dir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, dir, "model.aontu", "x: 1\n")
	writeFile(t, cdir, "model-config.aon", "sys: model: which: aon\n")
	writeFile(t, cdir, "model-config.aontu", "sys: model: which: aontu\n")

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	for name, want := range map[string]string{
		"model-config.aon":   "sys: model: which: aon\n",
		"model-config.aontu": "sys: model: which: aontu\n",
	} {
		if got, _ := os.ReadFile(filepath.Join(cdir, name)); string(got) != want {
			t.Fatalf("%s changed to %q", name, got)
		}
	}
	if configValue(m, "which") != "aontu" {
		t.Fatalf("config read the wrong file: %#v", m.Config().Model())
	}
}

func TestConfigMissingIsCreatedAsAontu(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "model.aontu", "x: 1\n")

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir})
	if br := m.Run(); !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	cdir := filepath.Join(dir, ".model-config")
	if _, err := os.Stat(filepath.Join(cdir, "model-config.aontu")); err != nil {
		t.Fatalf("config not created: %v", err)
	}
	if _, err := os.Stat(filepath.Join(cdir, "model-config.aon")); !os.IsNotExist(err) {
		t.Fatalf("a .aon config must never be written (err=%v)", err)
	}
}

// A dryrun migrates in memory: the build uses the migrated config and nothing
// on disk changes.
func TestConfigDryrunMigratesLegacyInMemory(t *testing.T) {
	dir, cdir := legacyProject(t)

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir, Dryrun: true})
	if br := m.Run(); !br.OK {
		t.Fatalf("dryrun did not build: %v", br.Errs)
	}

	if got, _ := os.ReadFile(filepath.Join(cdir, "model-config.aon")); string(got) != legacyConfig {
		t.Fatalf("dryrun changed the legacy config: %q", got)
	}
	for _, name := range []string{"model-config.aontu", "model-config.json"} {
		if _, err := os.Stat(filepath.Join(cdir, name)); !os.IsNotExist(err) {
			t.Fatalf("dryrun wrote %s (err=%v)", name, err)
		}
	}
	if configValue(m, "local") != true {
		t.Fatalf("dryrun did not build the migrated config: %#v", m.Config().Model())
	}
}

func TestConfigDryrunCreatesMissingInMemory(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "model.aontu", "x: 1\n")

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir, Dryrun: true})
	if br := m.Run(); !br.OK {
		t.Fatalf("dryrun did not build: %v", br.Errs)
	}
	for _, name := range []string{".model-config", "model.json"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("dryrun wrote %s (err=%v)", name, err)
		}
	}
}

func TestConfigDryrunWatchStartsWithConfigInMemory(t *testing.T) {
	dir, cdir := legacyProject(t)

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir, Dryrun: true})
	defer m.Stop()
	if br := m.Start(); !br.OK {
		t.Fatalf("dryrun did not start: %v", br.Errs)
	}
	if got, _ := os.ReadFile(filepath.Join(cdir, "model-config.aon")); string(got) != legacyConfig {
		t.Fatalf("dryrun changed the legacy config: %q", got)
	}
	if _, err := os.Stat(filepath.Join(cdir, "model-config.aontu")); !os.IsNotExist(err) {
		t.Fatalf("dryrun wrote model-config.aontu (err=%v)", err)
	}
}

func flagConfig(flag string) string {
	return "@\"./local.aon\"\nsys: model: action: {}\nsys: model: flag: " + flag + "\n"
}

func flagProject(t *testing.T) (dir, cdir string) {
	t.Helper()
	dir = t.TempDir()
	cdir = filepath.Join(dir, ".model-config")
	if err := os.MkdirAll(cdir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, dir, "model.aontu", "x: 1\n")
	writeFile(t, cdir, "local.aontu", "sys: model: order: action: *\"\"\n")
	writeFile(t, cdir, "model-config.aon", flagConfig("1"))
	return dir, cdir
}

// editLater writes a second into the future, so the mtime moves on any
// filesystem.
func editLater(t *testing.T, path, src string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(time.Second)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}
}

func dirNames(t *testing.T, dir string) string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return strings.Join(names, ",")
}

// A dryrun keeps no snapshot of a legacy config: each config build
// re-derives it from model-config.aon.
func TestConfigDryrunRerunReadsLegacyEdits(t *testing.T) {
	dir, cdir := flagProject(t)
	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir, Dryrun: true})

	if br := m.Run(); !br.OK || configValue(m, "flag") != int64(1) {
		t.Fatalf("first run: ok=%v flag=%#v errs=%v", br.OK, configValue(m, "flag"), br.Errs)
	}

	editLater(t, filepath.Join(cdir, "model-config.aon"), flagConfig("2"))
	if br := m.Run(); !br.OK {
		t.Fatalf("second run failed: %v", br.Errs)
	}
	if configValue(m, "flag") != int64(2) {
		t.Fatalf("flag = %#v after editing the legacy config, want 2", configValue(m, "flag"))
	}
	if _, err := os.Stat(filepath.Join(cdir, "model-config.aontu")); !os.IsNotExist(err) {
		t.Fatalf("dryrun wrote model-config.aontu (err=%v)", err)
	}
}

func TestConfigDryrunWatchRebuildsOnLegacyEdit(t *testing.T) {
	dir, cdir := flagProject(t)

	var mu sync.Mutex
	var flag any
	m := New(ModelSpec{
		Path:   filepath.Join(dir, "model.aontu"),
		Base:   dir,
		Dryrun: true,
		Idle:   60 * time.Millisecond,
		Actions: map[string]ActionDef{
			"capture": {Run: func(_ map[string]any, b *Build, _ *BuildContext) ActionResult {
				v := configValue(&Model{config: b.Use["config"].(*Config)}, "flag")
				mu.Lock()
				flag = v
				mu.Unlock()
				return ActionResult{OK: true}
			}},
		},
	})
	read := func() any { mu.Lock(); defer mu.Unlock(); return flag }

	br := m.Start()
	defer m.Stop()
	if !br.OK || read() != int64(1) {
		t.Fatalf("start: ok=%v flag=%#v errs=%v", br.OK, read(), br.Errs)
	}

	time.Sleep(120 * time.Millisecond)
	editLater(t, filepath.Join(cdir, "model-config.aon"), flagConfig("2"))

	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) && read() != int64(2) {
		time.Sleep(30 * time.Millisecond)
	}
	if read() != int64(2) {
		t.Fatalf("flag = %#v after editing the legacy config, want 2", read())
	}
	if _, err := os.Stat(filepath.Join(cdir, "model-config.aontu")); !os.IsNotExist(err) {
		t.Fatalf("dryrun wrote model-config.aontu (err=%v)", err)
	}
}

// Only a missing legacy file means there is none. One that cannot be read
// fails the config build, and no default is written over it.
func TestConfigUnreadableLegacyFailsAndWritesNothing(t *testing.T) {
	dir := t.TempDir()
	cdir := filepath.Join(dir, ".model-config")
	if err := os.MkdirAll(filepath.Join(cdir, "model-config.aon"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, dir, "model.aontu", "x: 1\n")

	br := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir}).Run()
	if br.OK {
		t.Fatal("an unreadable legacy config must fail the build")
	}
	if len(br.Errs) == 0 || !strings.Contains(br.Errs[0].Error(), "model config: cannot read ") ||
		!strings.Contains(br.Errs[0].Error(), "model-config.aon") {
		t.Fatalf("errs = %v", br.Errs)
	}
	for _, name := range []string{".model-config/model-config.aontu", "model.json"} {
		if _, err := os.Stat(filepath.Join(dir, name)); !os.IsNotExist(err) {
			t.Fatalf("wrote %s (err=%v)", name, err)
		}
	}
}

// faultFS fails reads of a .aon file, or writes after writing half the data.
type faultFS struct {
	OSFS
	readErr  error
	writeErr error
}

func (f faultFS) ReadFile(name string) ([]byte, error) {
	if f.readErr != nil && strings.HasSuffix(name, ".aon") {
		return nil, &os.PathError{Op: "open", Path: name, Err: f.readErr}
	}
	return f.OSFS.ReadFile(name)
}

func (f faultFS) WriteFile(name string, data []byte, perm os.FileMode) error {
	if f.writeErr != nil {
		_ = os.WriteFile(name, data[:len(data)/2], perm)
		return f.writeErr
	}
	return f.OSFS.WriteFile(name, data, perm)
}

func TestConfigLegacyReadErrorIsReported(t *testing.T) {
	_, cdir := flagProject(t)

	prep := prepareConfig(faultFS{readErr: os.ErrPermission}, cdir, false, NopLog{})

	if !errors.Is(prep.err, os.ErrPermission) {
		t.Fatalf("err = %v, want a permission error", prep.err)
	}
	if got := dirNames(t, cdir); got != "local.aontu,model-config.aon" {
		t.Fatalf(".model-config holds %s", got)
	}
}

// A write that fails part way leaves no model-config.aontu, which would
// otherwise take precedence over the intact legacy file on the next run.
func TestConfigFailedWriteLeavesNoPartialFile(t *testing.T) {
	dir, cdir := flagProject(t)
	nospace := errors.New("no space left on device")

	prep := prepareConfig(faultFS{writeErr: nospace}, cdir, false, NopLog{})

	if !errors.Is(prep.err, nospace) {
		t.Fatalf("err = %v, want the write error", prep.err)
	}
	if got := dirNames(t, cdir); got != "local.aontu,model-config.aon" {
		t.Fatalf(".model-config holds %s", got)
	}
	if got, _ := os.ReadFile(filepath.Join(cdir, "model-config.aon")); string(got) != flagConfig("1") {
		t.Fatalf("legacy config changed: %q", got)
	}

	m := New(ModelSpec{Path: filepath.Join(dir, "model.aontu"), Base: dir})
	if br := m.Run(); !br.OK || configValue(m, "flag") != int64(1) {
		t.Fatalf("rerun: ok=%v flag=%#v errs=%v", br.OK, configValue(m, "flag"), br.Errs)
	}
	if got := dirNames(t, cdir); got != "local.aontu,model-config.aontu,model-config.json" {
		t.Fatalf(".model-config holds %s", got)
	}
}
