
import Path from 'path'

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


function jsonify(value: any, indent: string): string {
  if (Array.isArray(value)) {
    if (0 === value.length) {
      return '[]'
    }
    const inner = indent + '  '
    // Array.from visits holes (as undefined); map/join would skip them.
    return '[\n' +
      Array.from(value, (item) => inner + jsonify(item, inner)).join(',\n') +
      '\n' + indent + ']'
  }

  if (null != value && 'object' === typeof value) {
    if ('function' === typeof value.toJSON) {
      return jsonify(value.toJSON(), indent)
    }
    const keys = Object.keys(value)
      .filter((key) => {
        const item = value[key]
        return undefined !== item &&
          'function' !== typeof item && 'symbol' !== typeof item
      })
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    if (0 === keys.length) {
      return '{}'
    }
    const inner = indent + '  '
    return '{\n' +
      keys.map((key) =>
        inner + jstr(key) + ': ' + jsonify(value[key], inner))
        .join(',\n') +
      '\n' + indent + '}'
  }

  const scalar = jstr(value)
  return undefined === scalar ? 'null' : scalar
}


function jstr(value: any): string | undefined {
  const out = JSON.stringify(value)
  return undefined === out ? undefined :
    out.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
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
