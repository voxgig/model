
import Path from 'path'

import type { Build, Builder, BuildContext } from '../types'


// Runs any builders local to the repo.
const local_builder: Builder = async (build: Build, ctx: BuildContext) => {
  ctx.state.local = (ctx.state.local || {})
  let actionDefs = ctx.state.local.actionDefs

  if (null == actionDefs) {
    try {
      actionDefs = ctx.state.local.actionDefs = []

      // TODO: need to provide project root via build
      let root = Path.resolve(build.path, '..', '..')


      // TODO: build should do this
      let configbuild = build.use.config

      let config = configbuild.watch.last.build.model

      let builders = config.sys.model.builders

      // TODO: order by comma sep string
      // Load builders
      for (let name in builders) {
        let builder = builders[name]
        let action_path = Path.join(root, builder.load)


        // clear(action_path)


        let action = require(action_path)

        if (action instanceof Promise) {
          action = await action
        }

        const step = action.step || 'post'

        actionDefs.push({ name, builder, action, step })
      }
    }
    catch (e: any) {
      throw e
    }
  }


  const runActionDefs = actionDefs.filter((ad: any) => ctx.step === ad.step || 'all' === ad.step)

  // console.log(runActionDefs)

  build.log.info({
    point: ctx.step + '-actions', step: ctx.step, actions: runActionDefs,
    note: runActionDefs.map((ad: any) => ad.name).join(';')
  })

  let ok = true
  let brlog = []

  for (let actionDef of runActionDefs) {
    let br = await actionDef.action(build.model, build)
    ok = ok && null != br && br.ok
    brlog.push(br)
  }

  return { ok: true, step: ctx.step, active: true }
}

/*
// Adapted from https://github.com/sindresorhus/import-fresh - Thanks!
function clear(path: string) {
  let filePath = require.resolve(path)

  if (require.cache[filePath]) {
    const children = require.cache[filePath].children.map(child => child.id)

    // Delete module from cache
    delete require.cache[filePath]

    for (const id of children) {
      clear(id)
    }
  }


  if (require.cache[filePath] && require.cache[filePath].parent) {
    let i = require.cache[filePath].parent.children.length

    while (i--) {
      if (require.cache[filePath].parent.children[i].id === filePath) {
        require.cache[filePath].parent.children.splice(i, 1)
      }
    }
  }

}
*/


export {
  local_builder
}
