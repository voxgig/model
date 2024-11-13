
import Path from 'path'

import { writeFile } from 'fs/promises'

import type { Build, Builder, BuildContext } from '../types'


// Builds the main model file, after unification.
const model_builder: Builder = async (build: Build, ctx: BuildContext) => {
  if ('post' !== ctx.step) {
    return { ok: true, step: ctx.step, active: false }
  }

  try {
    let json = JSON.stringify(build.root.gen(), null, 2)

    let filename = Path.basename(build.path)
    let filenameparts = filename.match(/^(.*)\.[^.]+$/)
    if (filenameparts) {
      filename = filenameparts[1]
    }

    let file = build.opts.base + '/' + filename + '.json'

    build.log.info({
      point: 'write-model',
      path: file,
      note: file.replace(process.cwd(), '.')
    })

    await writeFile(file, json)

    return { ok: true, step: ctx.step, active: true }
  }
  catch (e: any) {
    throw e
  }
}

export {
  model_builder
}
