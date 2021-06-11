
import { writeFile } from 'fs/promises'

import { Build, Builder } from '../build'


const model_builder: Builder = async (build: Build) => {

  let json = JSON.stringify(build.root.gen(), null, 2)

  let file = build.opts.base + '/model.json'

  // console.log('MODEL OUT', file, json)

  await writeFile(file, json)

  return { ok: true }
}

export {
  model_builder
}
