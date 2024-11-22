
import Path from 'path'

import type { Build, Builder, BuildContext } from '../types'


// Runs any builders local to the repo.
const local_builder: Builder = async (build: Build, ctx: BuildContext) => {
  ctx.state.local = (ctx.state.local || {})
  let actionDefs = ctx.state.local.actionDefs

  if (null == actionDefs) {
    actionDefs = ctx.state.local.actionDefs = []

    // TODO: need to provide project root via build
    let root = Path.resolve(build.path, '..', '..')


    // TODO: build should do this
    let configbuild = build.use.config

    let config = configbuild.watch.last?.build.model || {}

    let builders = config.sys?.model.builders || {}

    // TODO: order by comma sep string
    // Load builders
    for (let name in builders) {
      let builder = builders[name]
      let action_path = Path.join(root, builder.load)

      let action = require(action_path)

      if (action instanceof Promise) {
        action = await action
      }

      const step = action.step || 'post'

      actionDefs.push({ name, builder, action, step })
    }
  }

  const runActionDefs = actionDefs.filter((ad: any) => ctx.step === ad.step || 'all' === ad.step)

  build.log.info({
    point: ctx.step + '-actions', step: ctx.step, actions: runActionDefs,
    note: runActionDefs.map((ad: any) => ad.name).join(';')
  })

  let ok = true
  let areslog = []

  for (let actionDef of runActionDefs) {
    try {
      let ares = await actionDef.action(build.model, build, ctx)
      ok = ok && null != ares && ares.ok
      areslog.push(ares)

      if (!ok) { break }
    }
    catch (err: any) {
      if (!err.__logged__) {
        build.log.error({
          point: ctx.step + '-action', step: ctx.step, action: actionDef,
          note: actionDef.name,
          err
        })
        err.__logged__ = true
      }
      throw err
    }
  }

  return { ok, step: ctx.step, active: true }
}


export {
  local_builder
}
