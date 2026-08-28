/* Copyright © 2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Mirrors ts/test/msg.test.ts. Sources use plain aontu (no aliases or
// close()), because the checks read the RESOLVED model and must hold whatever
// the source used to express it.
//
// Not parallel: AontuResolver changes the working directory.

// msgBuild runs src through the msg check and the model producer, as New
// wires them: msg first (pre), model second (post).
func msgBuild(t *testing.T, src string) (*BuildResult, string) {
	t.Helper()

	dir := t.TempDir()
	writeFile(t, dir, "m.aon", src)

	b := NewBuild(BuildSpec{
		Path: filepath.Join(dir, "m.aon"),
		Base: dir,
		Res: []ProducerDef{
			{Path: "/", Build: MsgProducer},
			{Path: "/", Build: ModelProducer},
		},
	})

	return b.Run(false), filepath.Join(dir, "m.json")
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// === declared shape, valid ===

func TestMsgValidDeclarationBuilds(t *testing.T) {
	br, out := msgBuild(t, "main: msg: save_item: {\n"+
		"  pat: [ {aim: web}, {save: item} ]\n"+
		"  doc: \"Save a todo item\"\n"+
		"}\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	if !exists(out) {
		t.Fatal("model.json not written")
	}
}

func TestMsgMultipleDeclarationsBuild(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: {\n"+
		"  save_item: { pat: [ {aim: web}, {save: item} ] }\n"+
		"  load_item: { pat: [ {aim: web}, {load: item} ] }\n"+
		"  publish_fixture: { pat: [ {aim: cag}, {publish: fixture} ] }\n"+
		"}\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// A single-pair pattern is legal: the key is verb_noun of that one pair.
func TestMsgSinglePairPattern(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: get_info: { pat: [ {get: info} ] }\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// === backwards compatibility ===

// The legacy nested chain carries no pat list, so it is left alone.
func TestMsgLegacyChainUntouched(t *testing.T) {
	br, out := msgBuild(t, "main: msg: aim: web: {\n"+
		"  get: info: {}\n"+
		"  on: todo: { save: item: { '$': { file: './web_save_item' } } }\n"+
		"}\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	if !exists(out) {
		t.Fatal("model.json not written")
	}
}

// Both shapes in one model: the chain is skipped, the declaration checked.
func TestMsgMixedShapesBuild(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: {\n"+
		"  aim: web: { save: item: {} }\n"+
		"  publish_fixture: { pat: [ {aim: cag}, {publish: fixture} ] }\n"+
		"}\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// A legacy pattern pair spelled pat: is still a chain node - its value is a
// map, not a list - so the discriminator does not misread it.
func TestMsgLegacyPatKeyNotADefinition(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: pat: web: { save: item: {} }\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

func TestMsgNoMessages(t *testing.T) {
	br, _ := msgBuild(t, "main: entity: item: { name: \"item\" }\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// === key / last-pair consistency ===

func TestMsgKeyMismatchFails(t *testing.T) {
	br, out := msgBuild(t,
		"main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n")

	if br.OK {
		t.Fatal("expected failure for a key that does not match the last pat pair")
	}
	if !containsErr(br.Errs,
		`model msg "save_todo": key does not match last pat pair save:item (expected "save_item")`) {
		t.Fatalf("errors = %v", br.Errs)
	}

	// The check runs in the pre phase, so nothing was written.
	if exists(out) {
		t.Fatal("model.json written despite a failed check")
	}
}

// The LAST pair names the key, not the first.
func TestMsgKeyFromLastPairOnly(t *testing.T) {
	br, _ := msgBuild(t,
		"main: msg: aim_web: { pat: [ {aim: web}, {save: item} ] }\n")

	if br.OK {
		t.Fatal("expected failure")
	}
	if !containsErr(br.Errs, `expected "save_item"`) {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// === duplicate patterns ===

func TestMsgDuplicatePatFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: {\n"+
		"  save_item: { pat: [ {aim: web}, {save: item} ] }\n"+
		"  x_save_item: { pat: [ {aim: web}, {save: item} ] }\n"+
		"}\n")

	if br.OK {
		t.Fatal("expected failure for a duplicate pat")
	}
	if !containsErr(br.Errs,
		`model msg "x_save_item": pat [aim:web,save:item] is already declared by "save_item"`) {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// Pattern identity is structural, not a rendering of it: a value carrying the
// delimiters used to display a pattern must not collide with a genuinely
// different pattern.
func TestCheckMsgDelimitersInValuesDoNotCollide(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": map[string]any{
		"a_b,c:d": map[string]any{"pat": []any{map[string]any{"a": "b,c:d"}}},
		"c_d":     map[string]any{"pat": []any{map[string]any{"a": "b"}, map[string]any{"c": "d"}}},
	}}})

	if len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
}

// Same pairs in a different order are different patterns.
func TestMsgReorderedPatIsDistinct(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: {\n"+
		"  save_item: { pat: [ {aim: web}, {save: item} ] }\n"+
		"  aim_web: { pat: [ {save: item}, {aim: web} ] }\n"+
		"}\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// === malformed patterns ===

func TestMsgEmptyPatFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: save_item: { pat: [] }\n")

	if br.OK {
		t.Fatal("expected failure for an empty pat")
	}
	if !containsErr(br.Errs, `model msg "save_item": pat declares no pattern pairs`) {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgMultiKeyPairFails(t *testing.T) {
	br, _ := msgBuild(t,
		"main: msg: save_item: { pat: [ {aim: web, save: item} ] }\n")

	if br.OK {
		t.Fatal("expected failure for a multi-key pat pair")
	}
	if !containsErr(br.Errs,
		`model msg "save_item": pat pair 0 is not a single key:value pair`) {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgNonStringPairValueFails(t *testing.T) {
	br, _ := msgBuild(t,
		"main: msg: save_item: { pat: [ {aim: web}, {save: 1} ] }\n")

	if br.OK {
		t.Fatal("expected failure for a non-string pat pair value")
	}
	if !containsErr(br.Errs,
		`model msg "save_item": pat pair 1 (save) value is not a string`) {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// === checkMsg unit cases (shapes aontu source cannot easily express) ===

func TestCheckMsgToleratesNonModelShapes(t *testing.T) {
	cases := []map[string]any{
		nil,
		{},
		{"main": "nope"},
		{"main": map[string]any{}},
		{"main": map[string]any{"msg": "nope"}},
		{"main": map[string]any{"msg": []any{}}},
		{"main": map[string]any{"msg": map[string]any{}}},
		// Entries that are not maps are not declarations.
		{"main": map[string]any{"msg": map[string]any{"a": 1, "b": nil}}},
	}

	for i, model := range cases {
		if problems := checkMsg(model); len(problems) != 0 {
			t.Fatalf("case %d: problems = %v", i, problems)
		}
	}
}

func TestCheckMsgRejectsNonMapPatElement(t *testing.T) {
	cases := []any{"aim:web", []any{}, map[string]any{}}

	for _, elem := range cases {
		problems := checkMsg(map[string]any{"main": map[string]any{"msg": map[string]any{
			"save_item": map[string]any{"pat": []any{elem}},
		}}})

		want := `model msg "save_item": pat pair 0 is not a single key:value pair`
		if len(problems) != 1 || problems[0] != want {
			t.Fatalf("elem %#v: problems = %v", elem, problems)
		}
	}
}

// A malformed pair stops that message's checks: no key-mismatch error is
// piled on top of a pattern that could not be read.
func TestCheckMsgReportsOneProblemPerBrokenPattern(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": map[string]any{
		"wrong_name": map[string]any{"pat": []any{map[string]any{"save": 1}}},
	}}})

	want := `model msg "wrong_name": pat pair 0 (save) value is not a string`
	if len(problems) != 1 || problems[0] != want {
		t.Fatalf("problems = %v", problems)
	}
}

// Problems are reported in byte order of the message name, so the two
// implementations agree (Go map iteration is otherwise random).
func TestCheckMsgOrdersProblemsByName(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": map[string]any{
		"zz": map[string]any{"pat": []any{map[string]any{"a": "b"}}},
		"aa": map[string]any{"pat": []any{map[string]any{"a": "b"}}},
		"mm": map[string]any{"pat": []any{}},
	}}})

	want := []string{
		`model msg "aa": key does not match last pat pair a:b (expected "a_b")`,
		`model msg "mm": pat declares no pattern pairs`,
		`model msg "zz": key does not match last pat pair a:b (expected "a_b")`,
		`model msg "zz": pat [a:b] is already declared by "aa"`,
	}

	if strings.Join(problems, "\n") != strings.Join(want, "\n") {
		t.Fatalf("problems =\n%s\nwant\n%s",
			strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// === producer mechanics ===

// The check runs in both phases. It has to: a pre action can request a
// reload, and the build re-resolves the model after the pre phase, so a
// pre-only check would let the regenerated model through unchecked.
func TestMsgProducerChecksInPostToo(t *testing.T) {
	b := &Build{
		Model: map[string]any{"main": map[string]any{"msg": map[string]any{
			"wrong": map[string]any{"pat": []any{map[string]any{"save": "item"}}},
		}}},
		Log: NopLog{},
	}
	ctx := &BuildContext{Step: StepPost}

	pr := MsgProducer(b, ctx)

	if pr.OK {
		t.Fatal("expected the post-phase check to fail")
	}
	if !containsErr(pr.Errs, `expected "save_item"`) {
		t.Fatalf("errors = %v", pr.Errs)
	}
}

// The real reload path: a pre producer rewrites the model source and asks for
// a reload, turning a valid model into an invalid one. The reloaded model must
// still be caught, with nothing written - this producer runs ahead of
// ModelProducer in the post phase too.
func TestMsgReloadedModelIsRechecked(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.aon")
	writeFile(t, dir, "m.aon",
		"main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n")

	rewritten := false
	rewrite := func(b *Build, ctx *BuildContext) ProducerResult {
		pr := ProducerResult{OK: true, Name: "rewrite", Step: ctx.Step, Active: true}
		if ctx.Step == StepPre && !rewritten {
			rewritten = true
			if err := os.WriteFile(path,
				[]byte("main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n"),
				0o644); err != nil {
				t.Fatal(err)
			}
			// Force a distinct mtime: resolveModel caches on it, and the
			// rewrite can land inside the same filesystem timestamp tick.
			future := time.Now().Add(2 * time.Second)
			if err := os.Chtimes(path, future, future); err != nil {
				t.Fatal(err)
			}
			pr.Reload = true
		}
		return pr
	}

	b := NewBuild(BuildSpec{
		Path: path, Base: dir,
		Res: []ProducerDef{
			{Path: "/", Build: MsgProducer},
			{Path: "/", Build: ModelProducer},
			{Path: "/", Build: rewrite},
		},
	})

	br := b.Run(false)

	if !rewritten {
		t.Fatal("the rewrite producer did not run")
	}
	if br.OK {
		t.Fatal("expected the reloaded model to fail the check")
	}
	if !containsErr(br.Errs, `model msg "save_todo": key does not match`) {
		t.Fatalf("errors = %v", br.Errs)
	}
	if exists(filepath.Join(dir, "m.json")) {
		t.Fatal("model.json written despite a failed check")
	}
}

// === wired into the Model ===

func TestModelRunsTheMsgCheck(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aon",
		"main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n")

	off := false
	m := New(ModelSpec{Path: filepath.Join(dir, "m.aon"), Base: dir, Config: &off})
	br := m.Run()

	if br.OK {
		t.Fatal("expected the model build to fail the msg check")
	}
	if !containsErr(br.Errs, `expected "save_item"`) {
		t.Fatalf("errors = %v", br.Errs)
	}
	if exists(filepath.Join(dir, "m.json")) {
		t.Fatal("model.json written despite a failed check")
	}
}

func TestModelBuildsAValidMsgDeclaration(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aon",
		"main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n")

	off := false
	m := New(ModelSpec{Path: filepath.Join(dir, "m.aon"), Base: dir, Config: &off})
	br := m.Run()

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	if !exists(filepath.Join(dir, "m.json")) {
		t.Fatal("model.json not written")
	}
}
