/* Copyright © 2026 Voxgig Ltd, MIT License. */

import type { Build, Producer, BuildContext, ProducerResult } from '../types'




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
