/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"testing"
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
