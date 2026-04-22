
import Path from 'path'

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


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

  let json = JSON.stringify(build.model, null, 2)

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
