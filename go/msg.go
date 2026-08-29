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
// pairs, so the pattern is the path down to the definition:
//
//	aim: web: { on: todo: { save: item: { '$': { file: './web_save_item' } } } }
//
// The declared shape is a LIST of definitions, each carrying its pattern as
// data - an ordered list of single-pair maps:
//
//	main: msg: [
//	  { pat: [ {aim: todo}, {save: item} ] }
//	  { pat: [ {aim: web}, {on: todo}, {save: item} ], file: "./web_save_item" }
//	]
//
// A LIST, NOT A MAP KEYED BY MESSAGE NAME. The obvious flat shape - one entry
// per message, keyed by name - cannot express a gateway proxy. A proxy and the
// message it forwards to necessarily share their last pattern pair
// (aim:web,on:todo,save:item proxies aim:todo,save:item), and a key derived
// from that pair therefore collides. Keyed by name, the two above would both
// demand save_item, and aontu would merge them and fail trying to unify todo
// with web. A list has no key, so the question never arises.
//
// The action file still comes from the LAST pattern pair (save:item ->
// save_item), with file overriding it for a custom name - unchanged, and
// exactly what a proxy uses. That convention lives in the consumers, not here.
//
// This runs in BOTH phases, and must: a pre action can rewrite model source
// and request a reload, and the build re-resolves the model AFTER the pre
// phase has finished (see Build.Run). A pre-only check would then have
// validated a model that no longer exists, and ModelProducer would write the
// regenerated one unchecked. Checking again in post closes that window - this
// producer is first in the pipeline, so it still runs ahead of ModelProducer,
// and a build whose model went bad during a reload fails with nothing
// written.
func MsgProducer(b *Build, ctx *BuildContext) ProducerResult {
	pr := ProducerResult{OK: true, Name: "msg", Step: ctx.Step, Active: true}

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

// checkMsg validates the message declarations in main.msg, returning one
// message per problem found (none when the model is valid, which includes a
// model with no messages at all, or only a legacy chain).
func checkMsg(model map[string]any) []string {
	main := asMap(model["main"])
	if main == nil {
		return nil
	}

	if list, isList := main["msg"].([]any); isList {
		return checkMsgList(list)
	}

	if chain := asMap(main["msg"]); chain != nil {
		return checkMsgChain(chain)
	}

	return nil
}

// checkMsgList validates the declared shape: a list of definitions.
func checkMsgList(msg []any) []string {
	var problems []string

	// Canonical pattern -> the index that declared it first.
	seen := map[string]int{}

	for mI, elem := range msg {
		def := asMap(elem)
		if def == nil {
			problems = append(problems, msgerr(mI, "is not a message definition"))
			continue
		}

		pat, isList := def["pat"].([]any)
		if !isList {
			problems = append(problems, msgerr(mI, "has no pat list"))
			continue
		}

		if len(pat) == 0 {
			problems = append(problems, msgerr(mI, "pat declares no pattern pairs"))
			continue
		}

		// Reduce the pattern to its pairs, stopping at the first malformed
		// one - the rest of the checks read the pairs, so there is nothing
		// further to say about this message until its pattern is well-formed.
		//
		// Two renderings: pairs reads well in a message, and canon identifies
		// the pattern. They cannot be the same string, because key:value
		// joined by commas is ambiguous once a key or value contains a
		// delimiter - [{a: "b,c:d"}] and [{a: b}, {c: d}] would both render
		// a:b,c:d and the second would be rejected as a duplicate of the
		// first. Quoting each part removes the ambiguity: a delimiter inside
		// a part is escaped, so only genuinely equal patterns produce equal
		// keys.
		pairs := make([]string, 0, len(pat))
		canon := make([]string, 0, len(pat))
		wellFormed := true

		for pI, pelem := range pat {
			pair := asMap(pelem)
			if len(pair) != 1 {
				problems = append(problems, msgerr(mI,
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
				problems = append(problems, msgerr(mI,
					"pat pair "+strconv.Itoa(pI)+" ("+key+") value is not a string"))
				wellFormed = false
				break
			}

			pairs = append(pairs, key+":"+val)
			canon = append(canon, strconv.Quote(key)+":"+strconv.Quote(val))
		}

		if !wellFormed {
			continue
		}

		// file names the action file, overriding the last-pattern-pair
		// convention. A non-string would reach the consumers as one.
		if file, has := def["file"]; has {
			if _, isStr := file.(string); !isStr {
				problems = append(problems, msgerr(mI, "file is not a string"))
			}
		}

		canonKey := strings.Join(canon, ",")
		if first, dup := seen[canonKey]; dup {
			problems = append(problems, msgerr(mI,
				"pat ["+strings.Join(pairs, ",")+"] is already declared by msg ["+
					strconv.Itoa(first)+"]"))
		} else {
			seen[canonKey] = mI
		}
	}

	return problems
}

// checkMsgChain handles the legacy chain. Nothing to validate in the chain
// itself - it has been valid by construction since before this producer
// existed - but a definition found among its nodes is reported rather than
// walked: the nested walk reads two levels at a time, so it would take the
// definition's metadata keys for pattern pairs and emit patterns nobody
// declared.
func checkMsgChain(msg map[string]any) []string {
	var problems []string

	names := make([]string, 0, len(msg))
	for name := range msg {
		names = append(names, name)
	}
	// Byte order. Go map iteration is random, so without this the problems
	// would come out in a different order on every run - and in a different
	// order from the TypeScript producer, which sorts its keys the same way.
	sort.Strings(names)

	for _, name := range names {
		if isMsgDef(msg[name]) {
			problems = append(problems, `model msg "`+name+`": a message `+
				`definition must be declared in the main.msg list, not as a `+
				`keyed entry (main: msg: [ { pat: [...] } ])`)
		}
	}

	return problems
}

// isMsgDef reports whether a value is a message definition: a map declaring
// its pattern as a list.
func isMsgDef(val any) bool {
	def := asMap(val)
	if def == nil {
		return false
	}
	_, isList := def["pat"].([]any)
	return isList
}

// msgerr reports a problem against the definition it belongs to.
func msgerr(index int, why string) string {
	return "model msg [" + strconv.Itoa(index) + "]: " + why
}
