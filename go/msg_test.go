/* Copyright © 2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Mirrors ts/test/msg.test.ts. Sources use plain aontu, because the checks
// read the RESOLVED model and must hold whatever the source used to express
// it.
//
// Not parallel: AontuResolver changes the working directory.

// msgBuild runs src through the msg check and the model producer, as New
// wires them: msg first, then model.
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

// === the declared shape: a list ===

func TestMsgValidListBuilds(t *testing.T) {
	br, out := msgBuild(t, "main: msg: [\n"+
		"  { pat: [ {aim: web}, {save: item} ], doc: \"Save an item\" }\n"+
		"]\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
	if !exists(out) {
		t.Fatal("model.json not written")
	}
}

// THE REASON THE SHAPE IS A LIST. A gateway proxy and the message it forwards
// to share their last pattern pair, so any key derived from that pair
// collides. A list has no key.
func TestMsgGatewayProxyAndItsTarget(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [\n"+
		"  { pat: [ {aim: todo}, {save: item} ] }\n"+
		"  { pat: [ {aim: web}, {on: todo}, {save: item} ], file: \"./web_save_item\" }\n"+
		"]\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

func TestMsgMultipleDefinitionsBuild(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [\n"+
		"  { pat: [ {aim: web}, {save: item} ] }\n"+
		"  { pat: [ {aim: web}, {load: item} ] }\n"+
		"  { pat: [ {aim: cag}, {publish: fixture} ] }\n"+
		"]\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

func TestMsgSinglePairPattern(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [ { pat: [ {get: info} ] } ]\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

func TestMsgEmptyListBuilds(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: []\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// === backwards compatibility ===

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

func TestMsgNoMessages(t *testing.T) {
	br, _ := msgBuild(t, "main: entity: item: { name: \"item\" }\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// A legacy pattern pair spelled pat: is a chain node - its value is a map, not
// a list - so it is not mistaken for a definition.
func TestMsgLegacyPatKeyIsNotADefinition(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: pat: web: { save: item: {} }\n")
	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// A definition among chain nodes is reported, not walked.
func TestMsgDefinitionInAChainIsRejected(t *testing.T) {
	br, out := msgBuild(t,
		"main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n")

	if br.OK {
		t.Fatal("expected a definition in a chain to be rejected")
	}
	if !containsErr(br.Errs,
		`model msg "save_item": a message definition must be declared in the main.msg list`) {
		t.Fatalf("errors = %v", br.Errs)
	}
	if exists(out) {
		t.Fatal("model.json written despite a failed check")
	}
}

// === duplicate patterns ===

func TestMsgDuplicatePatFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [\n"+
		"  { pat: [ {aim: web}, {save: item} ] }\n"+
		"  { pat: [ {aim: web}, {save: item} ], doc: \"again\" }\n"+
		"]\n")

	if br.OK {
		t.Fatal("expected failure for a duplicate pat")
	}
	if !containsErr(br.Errs,
		"model msg [1]: pat [aim:web,save:item] is already declared by msg [0]") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgReorderedPatIsDistinct(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [\n"+
		"  { pat: [ {aim: web}, {save: item} ] }\n"+
		"  { pat: [ {save: item}, {aim: web} ] }\n"+
		"]\n")

	if !br.OK {
		t.Fatalf("build failed: %v", br.Errs)
	}
}

// === malformed definitions ===

func TestMsgEmptyPatFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [ { pat: [] } ]\n")

	if br.OK {
		t.Fatal("expected failure for an empty pat")
	}
	if !containsErr(br.Errs, "model msg [0]: pat declares no pattern pairs") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgMissingPatFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [ { doc: \"no pattern\" } ]\n")

	if br.OK {
		t.Fatal("expected failure for a definition with no pat")
	}
	if !containsErr(br.Errs, "model msg [0]: has no pat list") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgMultiKeyPairFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [ { pat: [ {aim: web, save: item} ] } ]\n")

	if br.OK {
		t.Fatal("expected failure for a multi-key pat pair")
	}
	if !containsErr(br.Errs,
		"model msg [0]: pat pair 0 is not a single key:value pair") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgNonStringPairValueFails(t *testing.T) {
	br, _ := msgBuild(t, "main: msg: [ { pat: [ {aim: web}, {save: 1} ] } ]\n")

	if br.OK {
		t.Fatal("expected failure for a non-string pat pair value")
	}
	if !containsErr(br.Errs,
		"model msg [0]: pat pair 1 (save) value is not a string") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

func TestMsgNonStringFileFails(t *testing.T) {
	br, _ := msgBuild(t,
		"main: msg: [ { pat: [ {aim: web}, {save: item} ], file: 1 } ]\n")

	if br.OK {
		t.Fatal("expected failure for a non-string file")
	}
	if !containsErr(br.Errs, "model msg [0]: file is not a string") {
		t.Fatalf("errors = %v", br.Errs)
	}
}

// === checkMsg unit cases ===

func TestCheckMsgToleratesNonModelShapes(t *testing.T) {
	cases := []map[string]any{
		nil,
		{},
		{"main": "nope"},
		{"main": map[string]any{}},
		{"main": map[string]any{"msg": "nope"}},
		{"main": map[string]any{"msg": []any{}}},
		{"main": map[string]any{"msg": map[string]any{}}},
	}

	for i, model := range cases {
		if problems := checkMsg(model); len(problems) != 0 {
			t.Fatalf("case %d: problems = %v", i, problems)
		}
	}
}

func TestCheckMsgRejectsNonDefinitionElements(t *testing.T) {
	for _, elem := range []any{"nope", nil, []any{}} {
		problems := checkMsg(map[string]any{"main": map[string]any{"msg": []any{elem}}})
		want := "model msg [0]: is not a message definition"
		if len(problems) != 1 || problems[0] != want {
			t.Fatalf("elem %#v: problems = %v", elem, problems)
		}
	}
}

func TestCheckMsgRejectsNonMapPatElement(t *testing.T) {
	for _, elem := range []any{"aim:web", []any{}, map[string]any{}} {
		problems := checkMsg(map[string]any{"main": map[string]any{"msg": []any{
			map[string]any{"pat": []any{elem}},
		}}})

		want := "model msg [0]: pat pair 0 is not a single key:value pair"
		if len(problems) != 1 || problems[0] != want {
			t.Fatalf("elem %#v: problems = %v", elem, problems)
		}
	}
}

// A malformed pair stops that definition's remaining checks.
func TestCheckMsgReportsOneProblemPerBrokenPattern(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": []any{
		map[string]any{"pat": []any{map[string]any{"save": 1}}, "file": 2},
	}}})

	want := "model msg [0]: pat pair 0 (save) value is not a string"
	if len(problems) != 1 || problems[0] != want {
		t.Fatalf("problems = %v", problems)
	}
}

// Problems come out in list order, the same in both implementations - no
// sorting needed, unlike map keys.
func TestCheckMsgOrdersProblemsByIndex(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": []any{
		map[string]any{"pat": []any{map[string]any{"a": "b"}}},
		map[string]any{"pat": []any{}},
		map[string]any{"pat": []any{map[string]any{"a": "b"}}},
	}}})

	want := []string{
		"model msg [1]: pat declares no pattern pairs",
		"model msg [2]: pat [a:b] is already declared by msg [0]",
	}

	if strings.Join(problems, "\n") != strings.Join(want, "\n") {
		t.Fatalf("problems =\n%s\nwant\n%s",
			strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// Pattern identity is structural, not a rendering of it.
func TestCheckMsgDelimitersInValuesDoNotCollide(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": []any{
		map[string]any{"pat": []any{map[string]any{"a": "b,c:d"}}},
		map[string]any{"pat": []any{map[string]any{"a": "b"}, map[string]any{"c": "d"}}},
	}}})

	if len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
}

// Two definitions in a chain are reported in byte order of the key, so both
// implementations agree (Go map iteration is otherwise random).
func TestCheckMsgDefinitionsInAChainAreOrdered(t *testing.T) {
	problems := checkMsg(map[string]any{"main": map[string]any{"msg": map[string]any{
		"zz": map[string]any{"pat": []any{map[string]any{"a": "b"}}},
		"aa": map[string]any{"pat": []any{map[string]any{"a": "b"}}},
	}}})

	why := `: a message definition must be declared in the main.msg list` +
		`, not as a keyed entry (main: msg: [ { pat: [...] } ])`
	want := []string{`model msg "aa"` + why, `model msg "zz"` + why}

	if strings.Join(problems, "\n") != strings.Join(want, "\n") {
		t.Fatalf("problems =\n%s\nwant\n%s",
			strings.Join(problems, "\n"), strings.Join(want, "\n"))
	}
}

// === producer mechanics ===

// The check runs in both phases: a pre action can request a reload, and the
// build re-resolves the model after the pre phase.
func TestMsgProducerChecksInPostToo(t *testing.T) {
	b := &Build{
		Model: map[string]any{"main": map[string]any{"msg": []any{
			map[string]any{"pat": []any{}},
		}}},
		Log: NopLog{},
	}
	ctx := &BuildContext{Step: StepPost}

	pr := MsgProducer(b, ctx)

	if pr.OK {
		t.Fatal("expected the post-phase check to fail")
	}
	if !containsErr(pr.Errs, "pat declares no pattern pairs") {
		t.Fatalf("errors = %v", pr.Errs)
	}
}

// The real reload path: a pre producer rewrites the model source and asks for
// a reload, turning a valid model into an invalid one.
func TestMsgReloadedModelIsRechecked(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "m.aon")
	writeFile(t, dir, "m.aon",
		"main: msg: [ { pat: [ {aim: web}, {save: item} ] } ]\n")

	rewritten := false
	rewrite := func(b *Build, ctx *BuildContext) ProducerResult {
		pr := ProducerResult{OK: true, Name: "rewrite", Step: ctx.Step, Active: true}
		if ctx.Step == StepPre && !rewritten {
			rewritten = true
			if err := os.WriteFile(path,
				[]byte("main: msg: [ { pat: [] } ]\n"), 0o644); err != nil {
				t.Fatal(err)
			}
			// Force a distinct mtime: resolveModel caches on it.
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
	if !containsErr(br.Errs, "model msg [0]: pat declares no pattern pairs") {
		t.Fatalf("errors = %v", br.Errs)
	}
	if exists(filepath.Join(dir, "m.json")) {
		t.Fatal("model.json written despite a failed check")
	}
}

// === wired into the Model ===

func TestModelRunsTheMsgCheck(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aon", "main: msg: [ { pat: [] } ]\n")

	off := false
	m := New(ModelSpec{Path: filepath.Join(dir, "m.aon"), Base: dir, Config: &off})
	br := m.Run()

	if br.OK {
		t.Fatal("expected the model build to fail the msg check")
	}
	if !containsErr(br.Errs, "pat declares no pattern pairs") {
		t.Fatalf("errors = %v", br.Errs)
	}
	if exists(filepath.Join(dir, "m.json")) {
		t.Fatal("model.json written despite a failed check")
	}
}

func TestModelBuildsAValidMsgDeclaration(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, dir, "m.aon",
		"main: msg: [ { pat: [ {aim: web}, {save: item} ] } ]\n")

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
