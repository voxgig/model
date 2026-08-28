/* Copyright © 2026 Voxgig Ltd, MIT License. */

package model

import (
	"errors"
	"sort"
	"strconv"
	"strings"
)

// MsgProducer checks the message declarations in main.msg before anything is
// written. It is the port of the TypeScript msg producer
// (ts/src/producer/msg.ts), which is canonical; the checks, their messages
// and their order match.
//
// Message declarations come in two shapes. The legacy shape nests the pattern
// pairs, so the pattern is the path down to the definition, and the
// definition sits at whatever depth that reaches:
//
//	aim: web: { on: todo: { save: item: { '$': { file: './web_save_item' } } } }
//
// The declared shape is flat - one entry per message, keyed by the message
// name, with the pattern as data and the definition at a known depth:
//
//	save_item: { pat: [ {aim: web}, {save: item} ], doc: "Save a todo item" }
//
// The two are told apart by pat: a definition is a map holding a pat LIST,
// and a legacy chain node never holds one, because every value in a chain
// node is a map - either the next pattern level or the '$' leaf. So the
// discriminator holds even for a legacy pattern pair that happens to be
// spelled pat:. Anything without a pat list is left alone entirely, which is
// what lets the two shapes coexist while models migrate message by message.
//
// Only the declared shape is checked, for the two things the flat shape makes
// checkable and the nested one did not: that the entry key agrees with the
// last pattern pair (the key names the action file), and that no two messages
// declare the same pattern (previously impossible to state twice, because the
// pattern WAS the path).
func MsgProducer(b *Build, ctx *BuildContext) ProducerResult {
	pr := ProducerResult{OK: true, Name: "msg", Step: ctx.Step, Active: true}

	// Check in the pre phase: the model is already resolved by then, so a bad
	// declaration fails the build before ModelProducer writes model.json in
	// post, rather than after.
	if ctx.Step != StepPre {
		return pr
	}

	problems := checkMsg(b.Model)
	if len(problems) == 0 {
		return pr
	}

	pr.OK = false
	for _, problem := range problems {
		pr.Errs = append(pr.Errs, errors.New(problem))
	}

	// Unlike the TypeScript producer, this does not add the errors to the
	// build itself: runProducer merges a failed producer's Errs. Both
	// implementations end up with the same errors on the build.
	b.Log.Error("msg-invalid", nil, strings.Join(problems, "; "))

	return pr
}

// checkMsg validates the declared-shape message entries in main.msg,
// returning one message per problem found (none when the model is valid,
// which includes a model with no messages at all, or only legacy chains).
func checkMsg(model map[string]any) []string {
	var problems []string

	msg := nestedMap(model, "main", "msg")
	if msg == nil {
		return problems
	}

	names := make([]string, 0, len(msg))
	for name := range msg {
		names = append(names, name)
	}
	// Byte order. Go map iteration is random, so without this the problems
	// would come out in a different order on every run - and in a different
	// order from the TypeScript producer, which sorts its keys the same way.
	sort.Strings(names)

	// Canonical pattern -> the message that claimed it first.
	seen := map[string]string{}

	for _, name := range names {
		def := asMap(msg[name])
		if def == nil {
			continue
		}

		// Legacy chain node: not this check's business.
		pat, isList := def["pat"].([]any)
		if !isList {
			continue
		}

		if len(pat) == 0 {
			problems = append(problems, msgerr(name, "pat declares no pattern pairs"))
			continue
		}

		// Reduce the pattern to its pairs, stopping at the first malformed
		// one - the rest of the checks read the pairs, so there is nothing
		// further to say about this message until its pattern is well-formed.
		pairs := make([]string, 0, len(pat))
		var lastKey, lastVal string
		wellFormed := true

		for pI, elem := range pat {
			pair := asMap(elem)
			if len(pair) != 1 {
				problems = append(problems, msgerr(name,
					"pat pair "+strconv.Itoa(pI)+" is not a single key:value pair"))
				wellFormed = false
				break
			}

			var key string
			for k := range pair {
				key = k
			}

			val, isStr := pair[key].(string)
			if !isStr {
				problems = append(problems, msgerr(name,
					"pat pair "+strconv.Itoa(pI)+" ("+key+") value is not a string"))
				wellFormed = false
				break
			}

			pairs = append(pairs, key+":"+val)
			lastKey, lastVal = key, val
		}

		if !wellFormed {
			continue
		}

		// The entry key names the action file, so it must agree with the last
		// pattern pair.
		expected := lastKey + "_" + lastVal
		if name != expected {
			problems = append(problems, msgerr(name,
				"key does not match last pat pair "+lastKey+":"+lastVal+
					` (expected "`+expected+`")`))
		}

		canon := strings.Join(pairs, ",")
		if first, dup := seen[canon]; dup {
			problems = append(problems, msgerr(name,
				"pat ["+canon+`] is already declared by "`+first+`"`))
		} else {
			seen[canon] = name
		}
	}

	return problems
}

// msgerr reports a problem against the message it belongs to.
func msgerr(name, why string) string {
	return `model msg "` + name + `": ` + why
}
