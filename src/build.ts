/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */


import { Aontu, Val, Nil, Context } from 'aontu'


import type {
  Build,
  BuildResult,
  BuildAction,
  Builder,
  BuildContext,
  BuildSpec,
  Log,
} from './types'



class BuildImpl implements Build {
  id
  src
  base
  path
  root: any = Nil.make()
  opts: any
  res
  spec
  model: any
  use = {}
  err: any[] = []
  ctx: BuildContext
  log: Log

  constructor(spec: BuildSpec, log: Log) {
    this.id = String(Math.random()).substring(3, 9)
    this.log = log

    this.spec = spec
    this.src = spec.src
    this.base = null == spec.base ? '' : spec.base
    this.path = null == spec.path ? '' : spec.path
    this.opts = {}
    this.ctx = { step: 'pre', state: {} }

    if (null != spec.base) {
      this.opts.base = spec.base
      this.opts.path = spec.path
    }

    if (null != spec.require) {
      this.opts.require = spec.require
    }

    this.res = spec.res || []

    Object.assign(this.use, spec.use || {})
  }


  async run(): Promise<BuildResult> {
    let hasErr = false

    // this.ctx.step = 'pre'
    this.ctx = { step: 'pre', state: {} }
    const brlog = []

    for (let builder of this.res) {
      try {
        let br = await builder.build(this, this.ctx)
        br.step = this.ctx.step
        br.path = builder.path
        br.builder = builder.build.name
        brlog.push(br)
      }
      catch (e: any) {
        this.err.push(e)
        hasErr = true
        break
      }
    }


    if (!hasErr) {
      this.root = Aontu(this.src, this.opts)
      hasErr = this.root.err && 0 < this.root.err.length

      if (hasErr) {
        this.err.push(...this.root.err)
      }
    }


    if (!hasErr) {
      let genctx = new Context({ root: this.root })
      this.model = this.root.gen(genctx)

      hasErr = genctx.err && 0 < genctx.err.length
      if (hasErr) {
        this.err.push(...genctx.err)
      }
      else {
        // TODO: only call if path value has changed

        this.ctx.step = 'post'

        for (let builder of this.res) {
          try {
            let br = await builder.build(this, this.ctx)
            br.step = this.ctx.step
            br.path = builder.path
            br.builder = builder.build.name
            brlog.push(br)
          }
          catch (e: any) {
            this.err.push(e)
            break
          }
        }
      }
    }

    const br = { ok: !hasErr, build: this, builders: brlog, err: this.err }

    return br
  }
}


function makeBuild(spec: BuildSpec, log: Log) {
  return new BuildImpl(spec, log)
}

export {
  makeBuild,
  BuildSpec,
  Val
}


