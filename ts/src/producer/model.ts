
import Path from 'path'

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


// Serialize the model to two-space-indented JSON with object keys in strictly
// lexical (UTF-8 byte) order, byte-for-byte identical to the Go
// implementation's encoding/json. JSON.stringify cannot express this: JS
// objects iterate integer-like keys ("9", "10") in numeric order ahead of the
// other keys regardless of insertion order, so the order must be imposed
// during serialization, and the default JS string sort compares UTF-16 code
// units, which disagrees with Go's byte order for astral-plane keys. Arrays
// keep their order. Scalars, keys, and toJSON values delegate to
// JSON.stringify so escaping matches it exactly; undefined mirrors
// JSON.stringify (dropped from objects, null in arrays).
function jsonify(value: any, indent: string): string {
  if (Array.isArray(value)) {
    if (0 === value.length) {
      return '[]'
    }
    const inner = indent + '  '
    return '[\n' +
      value.map((item) => inner + jsonify(item, inner)).join(',\n') +
      '\n' + indent + ']'
  }

  if (null != value && 'object' === typeof value &&
    'function' !== typeof value.toJSON) {
    const keys = Object.keys(value)
      .filter((key) => undefined !== value[key])
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    if (0 === keys.length) {
      return '{}'
    }
    const inner = indent + '  '
    return '{\n' +
      keys.map((key) =>
        inner + JSON.stringify(key) + ': ' + jsonify(value[key], inner))
        .join(',\n') +
      '\n' + indent + '}'
  }

  const scalar = JSON.stringify(value)
  return undefined === scalar ? 'null' : scalar
}


// Builds the main model file, after unification.
const model_producer: Producer = async (build: Build, ctx: BuildContext) => {
  let pr: ProducerResult = {
    ok: true,
    name: 'model',
    reload: false,
    step: ctx.step,
    active: true,
    errs: [],
    runlog: []
  }

  if ('post' !== ctx.step) {
    return pr
  }

  let json = jsonify(build.model, '')

  let filename = Path.basename(build.path)
  let filenameparts = filename.match(/^(.*)\.[^.]+$/)
  if (filenameparts) {
    filename = filenameparts[1]
  }

  let file = build.opts.base + '/' + filename + '.json'

  // Skip write when output is unchanged — avoids mtime churn that would
  // invalidate caches (here and in downstream watchers).
  let existing: string | undefined
  try { existing = build.fs.readFileSync(file, 'utf8') } catch { }

  if (existing === json) {
    build.log.debug({
      point: 'write-model-skip',
      path: file,
      note: file.replace(process.cwd(), '.') + ' (unchanged)'
    })
    return pr
  }

  build.log.info({
    point: 'write-model',
    path: file,
    note: file.replace(process.cwd(), '.')
  })

  build.fs.mkdirSync(Path.dirname(file), { recursive: true })
  build.fs.writeFileSync(file, json)


  return pr
}

export {
  model_producer
}
