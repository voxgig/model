
import Path from 'path'

import { Build, Builder } from '../build'


const local_builder: Builder = async (build: Build) => {
  try {
    // TODO: need to provide project root via build
    let root = Path.resolve(build.path, '..', '..')

    // TODO: build should do this
    // console.log('LOCAL root:', root)
    let configbuild = build.use.config

    let config = configbuild.watch.last.build.model
    // console.log('CONFIG BUILD')
    // console.dir(config, { depth: null })

    let builders = config.sys.model.builders

    let ok = true
    let brlog = []

    // TODO: order by comma sep string
    for (let name in builders) {
      let builder = builders[name]
      let action_path = Path.join(root, builder.load)

      // TODO: need to watch these files too, and their deps!
      // console.log('ACTION PATH', name, action_path)

      let action = require(action_path)
      let br = await action(build.model, build)
      ok = ok && null != br && br.ok
      brlog.push(br)
    }

    return { ok: ok, brlog }
  } catch (e: any) {
    console.log('MODEL BUILD local', e)
    throw e
  }

}

export {
  local_builder
}
