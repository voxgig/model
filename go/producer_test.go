/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// ModelProducer writes the model JSON and skips the write when unchanged.
func TestModelProducerWritesAndSkips(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.aontu")
	writeFile(t, dir, "m.aontu", "a: 1\nb: 2\n")

	build := func() *Build {
		return NewBuild(BuildSpec{Path: path, Base: dir,
			Res: []ProducerDef{{Path: "/", Build: ModelProducer}}})
	}

	if br := build().Run(false); !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	out := filepath.Join(dir, "m.json")
	data, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}
	if got["a"] != float64(1) || got["b"] != float64(2) {
		t.Fatalf("unexpected model.json: %s", data)
	}

	info1, _ := os.Stat(out)
	time.Sleep(15 * time.Millisecond)
	if br := build().Run(false); !br.OK {
		t.Fatalf("second build failed: %v", br.Errs)
	}
	info2, _ := os.Stat(out)
	if !info1.ModTime().Equal(info2.ModTime()) {
		t.Fatal("model.json rewritten despite unchanged content")
	}
}

// Actions run in the configured order.
func TestLocalProducerOrder(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.aontu")
	writeFile(t, dir, "m.aontu", "x: 1\n")

	var order []string
	mk := func(name string) ActionDef {
		return ActionDef{Run: func(model map[string]any, b *Build, ctx *BuildContext) ActionResult {
			order = append(order, name)
			return ActionResult{OK: true}
		}}
	}
	b := NewBuild(BuildSpec{
		Path: path, Base: dir,
		Actions: map[string]ActionDef{"a": mk("a"), "b": mk("b"), "c": mk("c")},
		Order:   []string{"c", "a", "b"},
		Res:     []ProducerDef{{Path: "/", Build: LocalProducer}},
	})
	if br := b.Run(false); !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	if strings.Join(order, ",") != "c,a,b" {
		t.Fatalf("action order = %v", order)
	}
}

// An order entry naming an unregistered action fails clearly.
func TestUnknownAction(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.aontu")
	writeFile(t, dir, "m.aontu", "x: 1\n")

	b := NewBuild(BuildSpec{
		Path: path, Base: dir,
		Actions: map[string]ActionDef{
			"real": {Run: func(map[string]any, *Build, *BuildContext) ActionResult {
				return ActionResult{OK: true}
			}},
		},
		Order: []string{"real", "ghost"},
		Res:   []ProducerDef{{Path: "/", Build: LocalProducer}},
	})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure for unknown action")
	}
	if !containsErr(br.Errs, "ghost") {
		t.Fatalf("errors = %v", br.Errs)
	}
}
