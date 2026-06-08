/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// countResolver records how many times it was asked to resolve, and returns
// a fixed model. It exercises the Resolver seam without aontu.
type countResolver struct {
	model map[string]any
	errs  []error
	calls int
}

func (c *countResolver) Resolve(string) (map[string]any, []error) {
	c.calls++
	out := map[string]any{}
	for k, v := range c.model {
		out[k] = v
	}
	return out, c.errs
}

// A pre-action that invalidates the cache and requests a reload causes the
// model to be re-resolved before the post phase.
func TestReloadReResolves(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "a: 1\n")

	r := &countResolver{model: map[string]any{"a": int64(1)}}
	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"), Base: dir, Resolver: r,
		Actions: map[string]ActionDef{
			"regen": {Step: StepPre, Run: func(_ map[string]any, b *Build, _ *BuildContext) ActionResult {
				b.InvalidateCache() // a real pre-action would have rewritten source
				return ActionResult{OK: true, Reload: true}
			}},
		},
		Res: []ProducerDef{{Path: "/", Build: LocalProducer}},
	})

	br := b.Run(false)
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	if r.calls != 2 {
		t.Fatalf("resolve calls = %d, want 2 (initial + reload)", r.calls)
	}
}

// A custom resolver returning errors fails the build.
func TestResolverError(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "a: 1\n")
	r := &countResolver{errs: []error{errors.New("nope")}}
	b := NewBuild(BuildSpec{Path: filepath.Join(dir, "m.jsonic"), Base: dir, Resolver: r})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure from resolver error")
	}
	if !containsErr(br.Errs, "nope") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// A missing root file fails the build with the read error.
func TestMissingRootFile(t *testing.T) {
	dir := t.TempDir()
	b := NewBuild(BuildSpec{Path: filepath.Join(dir, "nope.jsonic"), Base: dir})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure for missing root file")
	}
	if len(br.Errs) == 0 {
		t.Fatal("expected an error")
	}
}

// A model that resolves to a non-object is rejected by AontuResolver.
func TestNonObjectModel(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "5\n")
	b := NewBuild(BuildSpec{Path: filepath.Join(dir, "m.jsonic"), Base: dir})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure for non-object model")
	}
	if len(br.Errs) == 0 {
		t.Fatal("expected an error")
	}
}

// Actions run only in their declared step; StepAll runs in both phases.
func TestActionSteps(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "x: 1\n")

	var log []string
	rec := func(name string) Action {
		return func(_ map[string]any, _ *Build, ctx *BuildContext) ActionResult {
			log = append(log, name+":"+string(ctx.Step))
			return ActionResult{OK: true}
		}
	}
	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"), Base: dir,
		Actions: map[string]ActionDef{
			"pre":  {Step: StepPre, Run: rec("pre")},
			"post": {Step: StepPost, Run: rec("post")},
			"all":  {Step: StepAll, Run: rec("all")},
		},
		Order: []string{"pre", "post", "all"},
		Res:   []ProducerDef{{Path: "/", Build: LocalProducer}},
	})
	if br := b.Run(false); !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	got := strings.Join(log, ",")
	want := "pre:pre,all:pre,post:post,all:post"
	if got != want {
		t.Fatalf("action run log = %q, want %q", got, want)
	}
}

// A failing action stops the build and skips later actions.
func TestActionFailsBuild(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "x: 1\n")

	var ran []string
	mk := func(name string, ok bool) ActionDef {
		return ActionDef{Run: func(_ map[string]any, _ *Build, _ *BuildContext) ActionResult {
			ran = append(ran, name)
			return ActionResult{OK: ok}
		}}
	}
	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"), Base: dir,
		Actions: map[string]ActionDef{"a": mk("a", true), "b": mk("b", false), "c": mk("c", true)},
		Order:   []string{"a", "b", "c"},
		Res:     []ProducerDef{{Path: "/", Build: LocalProducer}},
	})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected build failure from failing action")
	}
	if strings.Join(ran, ",") != "a,b" {
		t.Fatalf("ran %v, want [a b] (c skipped)", ran)
	}
}

// An action whose step matches but has no Run function fails the build.
func TestActionMissingRun(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "x: 1\n")
	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"), Base: dir,
		Actions: map[string]ActionDef{"empty": {Step: StepPost}},
		Order:   []string{"empty"},
		Res:     []ProducerDef{{Path: "/", Build: LocalProducer}},
	})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure for action with no Run")
	}
	if !containsErr(br.Errs, "no Run") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// A producer that panics is converted to a failed build, not a crash.
func TestProducerPanicRecovered(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "x: 1\n")
	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"), Base: dir,
		Res: []ProducerDef{{Path: "/", Build: func(_ *Build, _ *BuildContext) ProducerResult {
			panic("boom in producer")
		}}},
	})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure from panicking producer")
	}
	if !containsErr(br.Errs, "boom in producer") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// A filesystem write error fails the model producer.
type failWriteFS struct{ OSFS }

func (failWriteFS) WriteFile(string, []byte, os.FileMode) error {
	return errors.New("simulated write failure")
}

func TestModelProducerWriteError(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "a: 1\n")
	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.jsonic"), Base: dir, FS: failWriteFS{},
		Res: []ProducerDef{{Path: "/", Build: ModelProducer}},
	})
	br := b.Run(false)
	if br.OK {
		t.Fatal("expected failure when write fails")
	}
	if !containsErr(br.Errs, "write failure") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// Model.New honors dryrun and exposes the resolved build.
func TestModelDryrunAndBuild(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "a: 1\n")
	m := New(ModelSpec{Path: filepath.Join(dir, "m.jsonic"), Base: dir, Dryrun: true})

	br := m.Run()
	if !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); !os.IsNotExist(err) {
		t.Fatal("dryrun wrote m.json")
	}
	if m.Build() == nil || m.Build().Model["a"] != int64(1) {
		t.Fatalf("Build() model = %#v", m.Build())
	}
	if br.Build() != m.Build() {
		t.Fatal("BuildResult.Build() did not match Model.Build()")
	}
}

// NewWatch applies defaults; Last returns the most recent result.
func TestWatchRunAndLast(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.jsonic", "a: 1\n")
	b := NewBuild(BuildSpec{Path: filepath.Join(dir, "m.jsonic"), Base: dir})
	w := NewWatch(b, "", 0) // defaults: name "model", idle 111ms

	br := w.Run(false)
	if !br.OK {
		t.Fatalf("run failed: %v", br.Errs)
	}
	if w.Last() != br {
		t.Fatal("Last did not return the latest result")
	}
}
