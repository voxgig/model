/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func writeFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func containsErr(errs []error, sub string) bool {
	for _, e := range errs {
		if strings.Contains(e.Error(), sub) {
			return true
		}
	}
	return false
}

// End-to-end: New().Run() unifies the model, writes the JSON, and runs a
// registered action that sees the resolved model.
func TestModelRun(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aontu", "service: { name: 'orders', port: *8080 | integer }\n")

	var saw string
	m := New(ModelSpec{
		Path: filepath.Join(dir, "m.aontu"),
		Base: dir,
		Actions: map[string]ActionDef{
			"env": {Run: func(model map[string]any, b *Build, ctx *BuildContext) ActionResult {
				svc := model["service"].(map[string]any)
				saw = fmt.Sprintf("PORT=%v", svc["port"])
				return ActionResult{OK: true}
			}},
		},
	})
	br := m.Run()
	if !br.OK {
		t.Fatalf("model run failed: %v", br.Errs)
	}
	if saw != "PORT=8080" {
		t.Fatalf("action saw %q", saw)
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); err != nil {
		t.Fatalf("model JSON not written: %v", err)
	}
}

// Watch mode rebuilds when an imported source file changes.
func TestWatchRebuild(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aontu", "val: @\"./zed.aontu\"\n")
	writeFile(t, dir, "zed.aontu", "2")

	var mu sync.Mutex
	var last any
	m := New(ModelSpec{
		Path: filepath.Join(dir, "m.aontu"),
		Base: dir,
		Idle: 60 * time.Millisecond,
		Actions: map[string]ActionDef{
			"capture": {Step: StepPost, Run: func(model map[string]any, b *Build, ctx *BuildContext) ActionResult {
				mu.Lock()
				last = model["val"]
				mu.Unlock()
				return ActionResult{OK: true}
			}},
		},
	})

	br := m.Start()
	defer m.Stop()
	if !br.OK {
		t.Fatalf("initial build failed: %v", br.Errs)
	}

	read := func() any { mu.Lock(); defer mu.Unlock(); return last }
	if read() != int64(2) {
		t.Fatalf("initial val = %#v", read())
	}

	// Let the watcher settle, then change the imported file.
	time.Sleep(120 * time.Millisecond)
	writeFile(t, dir, "zed.aontu", "7")

	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		if read() == int64(7) {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	if read() != int64(7) {
		t.Fatalf("after change val = %#v", read())
	}
}

// Adding a new model source file under the base directory changes the watch
// snapshot and triggers a rebuild.
func TestWatchDetectsNewFile(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aontu", "x: 1\n")

	var mu sync.Mutex
	var runs int
	m := New(ModelSpec{
		Path: filepath.Join(dir, "m.aontu"),
		Base: dir,
		Idle: 60 * time.Millisecond,
		Actions: map[string]ActionDef{
			"count": {Step: StepPost, Run: func(_ map[string]any, _ *Build, _ *BuildContext) ActionResult {
				mu.Lock()
				runs++
				mu.Unlock()
				return ActionResult{OK: true}
			}},
		},
	})

	br := m.Start()
	defer m.Stop()
	if !br.OK {
		t.Fatalf("initial build failed: %v", br.Errs)
	}

	read := func() int { mu.Lock(); defer mu.Unlock(); return runs }
	initial := read()

	// Let the watcher settle, then add a new source file.
	time.Sleep(120 * time.Millisecond)
	writeFile(t, dir, "extra.aontu", "y: 2\n")

	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		if read() > initial {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	if read() <= initial {
		t.Fatalf("adding a source file did not trigger a rebuild (runs=%d)", read())
	}
}

// With config disabled, Start watches the model directly: the initial build
// writes the model JSON, no .model-config is created, and Stop releases the
// watcher cleanly.
func TestStartWithoutConfig(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aontu", "a: 1\n")

	disabled := false
	m := New(ModelSpec{
		Path:   filepath.Join(dir, "m.aontu"),
		Base:   dir,
		Config: &disabled,
		Idle:   60 * time.Millisecond,
	})

	br := m.Start()
	defer m.Stop()
	if !br.OK {
		t.Fatalf("start failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); err != nil {
		t.Fatalf("model.json not written: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config")); !os.IsNotExist(err) {
		t.Fatal(".model-config should not be created when config is disabled")
	}
	if m.Config() != nil {
		t.Fatal("Config() should be nil when config is disabled")
	}
}
