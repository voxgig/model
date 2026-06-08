/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"bytes"
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
)

// ModelProducer writes the unified model to <base>/<root-name>.json. It runs
// in the post phase only, and skips the write when the output is byte-for-byte
// unchanged (avoiding mtime churn that would re-trigger watchers).
//
// Go's encoding/json emits object keys in sorted order, where the TypeScript
// implementation preserves insertion order; the JSON content is otherwise
// equivalent. This is a known, accepted cross-language difference.
func ModelProducer(b *Build, ctx *BuildContext) ProducerResult {
	pr := ProducerResult{OK: true, Name: "model", Step: ctx.Step, Active: true}
	if ctx.Step != StepPost {
		return pr
	}

	data, err := json.MarshalIndent(b.Model, "", "  ")
	if err != nil {
		return fail("model", ctx.Step, err)
	}

	name := filepath.Base(b.Path)
	if ext := filepath.Ext(name); ext != "" {
		name = strings.TrimSuffix(name, ext)
	}
	file := filepath.Join(b.Base, name+".json")

	if existing, rerr := b.FS.ReadFile(file); rerr == nil && bytes.Equal(existing, data) {
		b.Log.Debug("write-model-skip", file+" (unchanged)")
		return pr
	}

	if merr := b.FS.MkdirAll(filepath.Dir(file), 0o755); merr != nil {
		return fail("model", ctx.Step, merr)
	}
	if werr := b.FS.WriteFile(file, data, 0o644); werr != nil {
		return fail("model", ctx.Step, werr)
	}
	b.Log.Info("write-model", file)
	return pr
}

// LocalProducer runs the registered actions whose step matches the current
// phase, in the order the config model declares (sys.model.order.action, then
// the keys of sys.model.action). With no config, it falls back to the build
// spec's order, then to the sorted registry keys. An order entry naming an
// unregistered action fails the build.
func LocalProducer(b *Build, ctx *BuildContext) ProducerResult {
	pr := ProducerResult{OK: true, Name: "local", Step: ctx.Step, Active: true}

	var ran []string
	for _, name := range actionOrder(b) {
		def, ok := b.spec.Actions[name]
		if !ok {
			pr.OK = false
			pr.Errs = append(pr.Errs,
				fmt.Errorf("unknown model action %q referenced in order", name))
			return pr
		}

		step := def.Step
		if step == "" {
			step = StepPost
		}
		if step != ctx.Step && step != StepAll {
			continue
		}
		if def.Run == nil {
			pr.OK = false
			pr.Errs = append(pr.Errs, fmt.Errorf("model action %q has no Run function", name))
			return pr
		}

		res := def.Run(b.Model, b, ctx)
		ran = append(ran, name)
		if res.Reload {
			pr.Reload = true
		}
		if !res.OK {
			pr.OK = false
			break
		}
	}

	b.Log.Info(string(ctx.Step)+"-actions", strings.Join(ran, ";"))
	return pr
}

// actionOrder resolves the ordered list of action names to run: from the
// linked config model if present, else the build spec's Order, else the
// sorted registry keys.
func actionOrder(b *Build) []string {
	if cfg, ok := b.Use["config"].(*Config); ok {
		if o := configOrder(cfg.Model()); len(o) > 0 {
			return o
		}
	}
	if len(b.spec.Order) > 0 {
		return b.spec.Order
	}
	names := make([]string, 0, len(b.spec.Actions))
	for name := range b.spec.Actions {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// configOrder reads the action order from a config model: an explicit
// sys.model.order.action string, otherwise the sorted keys of
// sys.model.action.
func configOrder(m map[string]any) []string {
	model := nestedMap(m, "sys", "model")
	if model == nil {
		return nil
	}
	if order := asMap(model["order"]); order != nil {
		if s, ok := order["action"].(string); ok && s != "" {
			return splitOrder(s)
		}
	}
	if action := asMap(model["action"]); len(action) > 0 {
		names := make([]string, 0, len(action))
		for name := range action {
			names = append(names, name)
		}
		sort.Strings(names)
		return names
	}
	return nil
}

func nestedMap(m map[string]any, keys ...string) map[string]any {
	cur := m
	for _, k := range keys {
		if cur == nil {
			return nil
		}
		cur = asMap(cur[k])
	}
	return cur
}

func asMap(v any) map[string]any {
	m, _ := v.(map[string]any)
	return m
}

func splitOrder(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func fail(name string, step Step, err error) ProducerResult {
	return ProducerResult{Name: name, Step: step, Active: true, OK: false, Errs: []error{err}}
}
