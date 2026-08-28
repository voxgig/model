/* Copyright © 2026 Voxgig Ltd, MIT License. */

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


// Message declarations live in `main.msg` and come in two shapes.
//
// The legacy shape nests the pattern pairs, so the pattern is the path down
// to the definition, and the definition sits at whatever depth that reaches:
//
//   aim: web: { on: todo: { save: item: { '$': { file: './web_save_item' } } } }
//
// The declared shape is flat - one entry per message, keyed by the message
// name, with the pattern as data and the definition at a known depth:
//
//   save_item: { pat: [ {aim: web}, {save: item} ], doc: "Save a todo item" }
//
// The two are told apart by `pat`: a definition is a map holding a `pat`
// LIST, and a legacy chain node never holds one, because every value in a
// chain node is a map - either the next pattern level or the '$' leaf. So the
// discriminator holds even for a legacy pattern pair that happens to be
// spelled `pat:`. Anything without a `pat` list is left alone entirely, which
// is what lets the two shapes coexist while models migrate message by
// message.
//
// Only the declared shape is checked here. The checks are the two things the
// flat shape makes checkable and the nested one did not:
//
//   1. the entry key agrees with the last pattern pair - the key names the
//      action file, a convention the legacy shape got implicitly from the
//      chain's leaf, and which becomes a real consistency check once the key
//      is written out by hand;
//   2. no two messages declare the same pattern - previously impossible to
//      state twice, because the pattern WAS the path.


// Report a problem against the message it belongs to.
function msgerr(name: string, why: string): string {
  return 'model msg "' + name + '": ' + why
}


function isObj(val: any): boolean {
  return null != val && 'object' === typeof val && !Array.isArray(val)
}


// A message definition declares its pattern as a list; a chain node never does.
function isMsgDef(val: any): boolean {
  return isObj(val) && Array.isArray(val.pat)
}


// Sort in UTF-8 byte order, matching Go's sort.Strings, so both
// implementations report the same problems in the same order. The default JS
// string sort compares UTF-16 code units, which disagrees for astral-plane
// names (see the model producer's jsonify, which sorts keys the same way).
function sortNames(names: string[]): string[] {
  return names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
}


// Validate the declared-shape message entries in main.msg, returning one
// message per problem found (empty when the model is valid, which includes a
// model with no messages at all, or only legacy chains).
function checkMsg(model: any): string[] {
  const problems: string[] = []

  const msg = model?.main?.msg
  if (!isObj(msg)) {
    return problems
  }

  // Canonical pattern -> the message that claimed it first.
  const seen: { [canon: string]: string } = {}

  for (const name of sortNames(Object.keys(msg))) {
    const def = msg[name]

    // Legacy chain node (or not a map at all): not this check's business.
    if (!isMsgDef(def)) {
      continue
    }

    const pat: any[] = def.pat

    if (0 === pat.length) {
      problems.push(msgerr(name, 'pat declares no pattern pairs'))
      continue
    }

    // Reduce the pattern to its pairs, stopping at the first malformed one -
    // the rest of the checks read the pairs, so there is nothing further to
    // say about this message until its pattern is well-formed.
    const pairs: string[] = []
    let last: string[] | undefined

    for (let pI = 0; pI < pat.length; pI++) {
      const pair = pat[pI]
      const keys = isObj(pair) ? Object.keys(pair) : []

      if (1 !== keys.length) {
        problems.push(msgerr(name, 'pat pair ' + pI +
          ' is not a single key:value pair'))
        last = undefined
        break
      }

      const key = keys[0]
      const val = pair[key]

      if ('string' !== typeof val) {
        problems.push(msgerr(name, 'pat pair ' + pI + ' (' + key +
          ') value is not a string'))
        last = undefined
        break
      }

      pairs.push(key + ':' + val)
      last = [key, val]
    }

    if (null == last) {
      continue
    }

    // The entry key names the action file, so it must agree with the last
    // pattern pair.
    const expected = last[0] + '_' + last[1]
    if (name !== expected) {
      problems.push(msgerr(name, 'key does not match last pat pair ' +
        last[0] + ':' + last[1] + ' (expected "' + expected + '")'))
    }

    const canon = pairs.join(',')
    if (null == seen[canon]) {
      seen[canon] = name
    }
    else {
      problems.push(msgerr(name, 'pat [' + canon +
        '] is already declared by "' + seen[canon] + '"'))
    }
  }

  return problems
}


// Checks the message declarations before anything is written.
const msg_producer: Producer = async (build: Build, ctx: BuildContext) => {
  const pr: ProducerResult = {
    ok: true,
    name: 'msg',
    reload: false,
    step: ctx.step,
    active: true,
    errs: [],
    runlog: []
  }

  // Validate in the pre phase: the model is already resolved by then, so a
  // bad declaration fails the build before the model producer writes
  // model.json in post, rather than after.
  if ('pre' !== ctx.step) {
    return pr
  }

  const problems = checkMsg(build.model)

  if (0 < problems.length) {
    pr.ok = false
    pr.errs = problems.map((problem) => new Error(problem))

    // Add them to the build too. BuildImpl.run collects the errors a producer
    // THROWS, but not the ones it returns, so a returned error would
    // otherwise be missing from the BuildResult. (The Go port needs no such
    // push: its runProducer merges a failed producer's Errs itself. Both
    // implementations end up with the same errors on the build.)
    build.errs.push(...pr.errs)

    build.log.error({
      point: 'msg-invalid',
      count: problems.length,
      note: problems.join('; ')
    })
  }

  return pr
}


export {
  msg_producer,
  checkMsg,
}
