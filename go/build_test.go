/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// A happy build resolves the model and exposes it to producers, with aontu
// applying defaults and types (port defaults to 8080 as an integer).
func TestRunHappy(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "service: { name: 'orders', port: *8080 | integer }\n")

	var seen map[string]any
	spec := BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"),
		Base: dir,
		Res: []ProducerDef{
			{Path: "/", Build: func(b *Build, ctx *BuildContext) ProducerResult {
				if ctx.Step == StepPost {
					seen = b.Model
				}
				return ProducerResult{OK: true, Name: "capture", Step: ctx.Step, Active: true}
			}},
		},
	}

	br := NewBuild(spec).Run(false)
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	svc, _ := seen["service"].(map[string]any)
	if svc["name"] != "orders" {
		t.Fatalf("name = %#v", svc["name"])
	}
	if svc["port"] != int64(8080) {
		t.Fatalf("port = %#v", svc["port"])
	}
}

// A failed build must not stick to the next run on a reused Build.
func TestErrorRecovery(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.jsonic")
	writeFile(t, dir, "m.jsonic", "x: 1\nx: 2\n")

	b := NewBuild(BuildSpec{Path: path, Base: dir})

	bad := b.Run(false)
	if bad.OK {
		t.Fatal("expected failure on conflicting values")
	}
	if len(bad.Errs) == 0 {
		t.Fatal("expected errors")
	}

	writeFile(t, dir, "m.jsonic", "x: 1\n")
	good := b.Run(false)
	if !good.OK {
		t.Fatalf("expected recovery after fix: %v", good.Errs)
	}
	if len(good.Errs) != 0 {
		t.Fatalf("errors leaked across runs: %v", good.Errs)
	}
}

// A dryrun build runs fully but writes nothing to disk.
func TestDryrunWritesNothing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.jsonic")
	writeFile(t, dir, "m.jsonic", "a: 1\n")

	b := NewBuild(BuildSpec{
		Path: path, Base: dir, Dryrun: true,
		Res: []ProducerDef{{Path: "/", Build: ModelProducer}},
	})
	br := b.Run(false)
	if !br.OK {
		t.Fatalf("dryrun build failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); !os.IsNotExist(err) {
		t.Fatal("dryrun wrote m.json to disk")
	}
}

// A second build with no source change is a cache hit: resolveModel returns
// early and the model is not re-resolved. Touching the root file is a cache
// miss and forces re-resolution. The countResolver (extra_test.go) records
// each resolve.
func TestCacheHitSkipsResolve(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.jsonic")
	writeFile(t, dir, "m.jsonic", "a: 1\n")

	r := &countResolver{model: map[string]any{"a": int64(1)}}
	b := NewBuild(BuildSpec{Path: path, Base: dir, Resolver: r})

	if br := b.Run(false); !br.OK {
		t.Fatalf("first run failed: %v", br.Errs)
	}
	if r.calls != 1 {
		t.Fatalf("resolve calls = %d, want 1", r.calls)
	}

	// No change between runs -> cache hit, no re-resolution.
	if br := b.Run(false); !br.OK {
		t.Fatalf("second run failed: %v", br.Errs)
	}
	if r.calls != 1 {
		t.Fatalf("resolve calls = %d after unchanged run, want 1 (cache hit)", r.calls)
	}

	// Touch the root file -> cache miss -> re-resolve.
	future := time.Now().Add(2 * time.Second)
	if err := os.Chtimes(path, future, future); err != nil {
		t.Fatal(err)
	}
	if br := b.Run(false); !br.OK {
		t.Fatalf("third run failed: %v", br.Errs)
	}
	if r.calls != 2 {
		t.Fatalf("resolve calls = %d after touch, want 2 (cache miss)", r.calls)
	}
}

// InvalidateCache forces the next build to re-resolve even when nothing on
// disk changed. The watcher relies on this to pick up edits to imported files,
// which the Go aontu engine does not report as deps.
func TestInvalidateCacheForcesResolve(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.jsonic")
	writeFile(t, dir, "m.jsonic", "a: 1\n")

	r := &countResolver{model: map[string]any{"a": int64(1)}}
	b := NewBuild(BuildSpec{Path: path, Base: dir, Resolver: r})

	b.Run(false)
	b.InvalidateCache()
	b.Run(false)
	if r.calls != 2 {
		t.Fatalf("resolve calls = %d, want 2 (InvalidateCache forces re-resolve)", r.calls)
	}
}
