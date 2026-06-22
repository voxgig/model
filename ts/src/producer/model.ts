
import Path from 'path'

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


// Recursively sort object keys alphabetically so the serialized model output
// is byte-for-byte identical to the Go implementation, whose encoding/json
// emits object keys in sorted order. Arrays keep their order; only object keys
// are reordered. Returns a new value and does not mutate the input model.
function sortKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (null != value && 'object' === typeof value) {
    const out: any = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeys(value[key])
    }
    return out
  }
  return value
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

  let json = JSON.stringify(sortKeys(build.model), null, 2)

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
