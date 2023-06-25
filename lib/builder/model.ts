
import Path from 'path'

import { writeFile } from 'fs/promises'

import { Build, Builder } from '../build'


const model_builder: Builder = async (build: Build) => {

  try {
    let json = JSON.stringify(build.root.gen(), null, 2)

    let filename = Path.basename(build.path)
    let filenameparts = filename.match(/^(.*)\.[^.]+$/)
    if (filenameparts) {
      filename = filenameparts[1]
    }

    let file = build.opts.base + '/' + filename + '.json'

    await writeFile(file, json)

    return { ok: true }
  } catch (e: any) {
    console.log('MODEL BUILD model', e)
    throw e
  }
}

export {
  model_builder
}
