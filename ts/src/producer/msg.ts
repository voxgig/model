/* Copyright © 2026 Voxgig Ltd, MIT License. */

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


// Message declarations live in `main.msg` and come in two shapes.
//
// The legacy shape nests the pattern pairs, so the pattern is the path down
// to the definition, and the definition sits at whatever depth that reaches:
//
//   aim: web: { on: todo: { save: item: { '$': { file: './web_save_item' } } } }
//
// The declared shape is a LIST of definitions, each carrying its pattern as
// data - an ordered list of single-pair maps:
//
//   main: msg: [
//     { pat: [ {aim: todo}, {save: item} ] }
//     { pat: [ {aim: web}, {on: todo}, {save: item} ], file: "./web_save_item" }
//   ]
//
// A LIST, NOT A MAP KEYED BY MESSAGE NAME. The obvious flat shape - one entry
// per message, keyed by name - cannot express a gateway proxy. A proxy and the
// message it forwards to necessarily share their last pattern pair
// (aim:web,on:todo,save:item proxies aim:todo,save:item), and a key derived
// from that pair therefore collides. Keyed by name, the two above would both
// demand `save_item`, and aontu would merge them and fail trying to unify
// `todo` with `web`. A list has no key, so the question never arises.
//
// The action file still comes from the LAST pattern pair (save:item ->
// save_item), with `file` overriding it for a custom name - unchanged, and
// exactly what a proxy uses. That convention lives in the consumers
// (@voxgig/system's actpath, @voxgig/build's actfile), not here.
//
// The two shapes are told apart by main.msg being an array. Both may appear
// in one model only in the sense that a model picks one; a chain model that
// happens to contain a definition is a mistake this reports, because the
// nested walk would read the definition's metadata as pattern pairs and
// silently produce garbage patterns.


// Report a problem against the definition it belongs to.
function msgerr(index: number, why: string): string {
  return 'model msg [' + index + ']: ' + why
}


function isObj(val: any): boolean {
  return null != val && 'object' === typeof val && !Array.isArray(val)
}


// A message definition declares its pattern as a list.
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


// Validate the message declarations in main.msg, returning one message per
// problem found (empty when the model is valid, which includes a model with
// no messages at all, or only a legacy chain).
function checkMsg(model: any): string[] {
  const msg = model?.main?.msg

  if (Array.isArray(msg)) {
    return checkMsgList(msg)
  }

  if (isObj(msg)) {
    return checkMsgChain(msg)
  }

  return []
}


// The declared shape: a list of definitions.
function checkMsgList(msg: any[]): string[] {
  const problems: string[] = []

  // Canonical pattern -> the index that declared it first.
  const seen: { [canon: string]: number } = {}

  for (let mI = 0; mI < msg.length; mI++) {
    const def = msg[mI]

    if (!isObj(def)) {
      problems.push(msgerr(mI, 'is not a message definition'))
      continue
    }

    if (!Array.isArray(def.pat)) {
      problems.push(msgerr(mI, 'has no pat list'))
      continue
    }

    const pat: any[] = def.pat

    if (0 === pat.length) {
      problems.push(msgerr(mI, 'pat declares no pattern pairs'))
      continue
    }

    // Reduce the pattern to its pairs, stopping at the first malformed one -
    // the rest of the checks read the pairs, so there is nothing further to
    // say about this message until its pattern is well-formed.
    //
    // Two renderings: `pairs` reads well in a message, and `canon` identifies
    // the pattern. They cannot be the same string, because `key:value` joined
    // by commas is ambiguous once a key or value contains a delimiter -
    // [{a: "b,c:d"}] and [{a: b}, {c: d}] would both render `a:b,c:d` and the
    // second would be rejected as a duplicate of the first. Quoting each part
    // removes the ambiguity: a delimiter inside a part is escaped, so only
    // genuinely equal patterns produce equal keys.
    const pairs: string[] = []
    const canon: string[] = []
    let wellFormed = true

    for (let pI = 0; pI < pat.length; pI++) {
      const pair = pat[pI]
      const keys = isObj(pair) ? Object.keys(pair) : []

      if (1 !== keys.length) {
        problems.push(msgerr(mI, 'pat pair ' + pI +
          ' is not a single key:value pair'))
        wellFormed = false
        break
      }

      const key = keys[0]
      const val = pair[key]

      if ('string' !== typeof val) {
        problems.push(msgerr(mI, 'pat pair ' + pI + ' (' + key +
          ') value is not a string'))
        wellFormed = false
        break
      }

      pairs.push(key + ':' + val)
      canon.push(JSON.stringify(key) + ':' + JSON.stringify(val))
    }

    if (!wellFormed) {
      continue
    }

    // `file` names the action file, overriding the last-pattern-pair
    // convention. A non-string would reach the consumers as one.
    if (undefined !== def.file && 'string' !== typeof def.file) {
      problems.push(msgerr(mI, 'file is not a string'))
    }

    const canonKey = canon.join(',')
    if (undefined === seen[canonKey]) {
      seen[canonKey] = mI
    }
    else {
      problems.push(msgerr(mI, 'pat [' + pairs.join(',') +
        '] is already declared by msg [' + seen[canonKey] + ']'))
    }
  }

  return problems
}


// The legacy chain. Nothing to validate in the chain itself - it has been
// valid by construction since before this producer existed - but a definition
// found among its nodes is reported rather than walked: the nested walk reads
// two levels at a time, so it would take the definition's metadata keys for
// pattern pairs and emit patterns nobody declared.
function checkMsgChain(msg: any): string[] {
  const problems: string[] = []

  for (const name of sortNames(Object.keys(msg))) {
    if (isMsgDef(msg[name])) {
      problems.push('model msg "' + name + '": a message definition must be ' +
        'declared in the main.msg list, not as a keyed entry ' +
        '(main: msg: [ { pat: [...] } ])')
    }
  }

  return problems
}


// Checks the message declarations before anything is written.
//
// This runs in BOTH phases, and must: a `pre` action can rewrite model source
// and request a reload, and the build re-resolves the model AFTER the pre
// phase has finished (see BuildImpl.run). A pre-only check would then have
// validated a model that no longer exists, and the model producer would write
// the regenerated one unchecked. Checking again in post closes that window -
// this producer is first in the pipeline, so it still runs ahead of the model
// producer, and a build whose model went bad during a reload fails with
// nothing written.
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
