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
	writeFile(t, dir, "m.jsonic", "service: { name: 'orders', port: *8080 | integer }\n")

	var saw string
	m := New(ModelSpec{
		Path: filepath.Join(dir, "m.jsonic"),
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
	writeFile(t, dir, "m.jsonic", "val: @\"./zed.jsonic\"\n")
	writeFile(t, dir, "zed.jsonic", "2")

	var mu sync.Mutex
	var last any
	m := New(ModelSpec{
		Path: filepath.Join(dir, "m.jsonic"),
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
	writeFile(t, dir, "zed.jsonic", "7")

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
