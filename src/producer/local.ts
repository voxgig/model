
import Path from 'path'

import type { Build, Producer, BuildContext, ProducerResult } from '../types'


// Runs any producers local to the repo.
const local_producer: Producer = async (build: Build, ctx: BuildContext) => {
  ctx.state.local = (ctx.state.local || {})
  let actionDefs = ctx.state.local.actionDefs

  if (null == actionDefs) {
    actionDefs = ctx.state.local.actionDefs = []

    // TODO: need to provide project root via build
    let root = Path.resolve(build.path, '..', '..')

    // TODO: build should do this
    let configBuildResult = build.use.config.watch.last
    let configBuild = configBuildResult?.build()
    let config = configBuild?.model || {}

    let actions = config.sys?.model?.action ||
      // NOTE: backwards compat
      config.sys?.model?.builders ||
      {}

    let ordering = config.sys?.model?.order?.action
    ordering = null == ordering ? Object.keys(actions) :
      ordering.split(/\s*,+\s*/).filter((n: string) => null != n && '' != n)

    // load actions
    for (let name of ordering) {
      let actiondef = actions[name]
      let actionpath = Path.join(root, actiondef.load)

      let action = require(actionpath)

      if (action instanceof Promise) {
        action = await action
      }

      const step = action.step || 'post'

      actionDefs.push({ name, actiondef, action, step })
    }
  }

  const runActionDefs = actionDefs.filter((ad: any) => ctx.step === ad.step || 'all' === ad.step)

  build.log.info({
    point: ctx.step + '-actions', step: ctx.step, actions: runActionDefs,
    note: runActionDefs.map((ad: any) => ad.name).join(';')
  })

  let ok = true
  let areslog = []
  let reload = false

  for (let actionDef of runActionDefs) {
    try {
      let ares = await actionDef.action(build.model, build, ctx)
      ok = ok && (null == ares || !!ares.ok)
      reload = reload || ares?.reload

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

  let pr: ProducerResult = {
    ok,
    reload,
    name: 'local',
    step: ctx.step,
    active: true,
    errs: [],
    runlog: []
  }

  return pr
}


export {
  local_producer
}
