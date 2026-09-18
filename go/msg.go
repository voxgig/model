/* Copyright © 2026 Voxgig Ltd, MIT License. */

package model

import (
	"errors"
	"sort"
	"strconv"
	"strings"
)

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

func msgerr(index int, why string) string {
	return "model msg [" + strconv.Itoa(index) + "]: " + why
}
