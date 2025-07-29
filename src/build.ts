/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */


import { Aontu, Val, Nil, Context } from 'aontu'


import type {
  Build,
  BuildResult,
  BuildContext,
  BuildSpec,
  RunSpec,
  Log,
  ProducerDef
} from './types'


class BuildImpl implements Build {
  id
  base
  path
  root: any = Nil.make()
  opts: any
  pdef: ProducerDef[]
  spec: BuildSpec
  model: any
  use = {}
  errs: any[] = []
  ctx: BuildContext
  log: Log
  fs: any
  dryrun: boolean
  args: any

  constructor(spec: BuildSpec, log: Log) {
    this.id = String(Math.random()).substring(3, 9)
    this.log = log

    this.spec = spec

    this.dryrun = !!spec.dryrun
    this.args = spec.buildargs
    this.fs = spec.fs
    this.base = null == spec.base ? '' : spec.base
    this.path = null == spec.path ? '' : spec.path
    this.opts = {}
    this.ctx = { step: 'pre', watch: false, state: {} }

    if (null != spec.base) {
      this.opts.base = spec.base
      this.opts.path = spec.path
    }

    if (null != spec.require) {
      this.opts.require = spec.require
    }

    this.pdef = spec.res || []

    Object.assign(this.use, spec.use || {})
  }


  async run(rspec: RunSpec): Promise<BuildResult> {
    let hasErr = false
    let runlog = []

    this.ctx = { step: 'pre', state: {}, watch: rspec.watch }
    const plog: any[] = []

    if (!hasErr) {
      runlog.push('model:initial')
      hasErr = await this.resolveModel()
    }

    let reload = false

    if (!hasErr) {
      for (let poducer of this.pdef) {
        try {
          runlog.push('producer:pre:' + poducer.build.name)
          let pr = await poducer.build(this, this.ctx)
          reload = reload || pr.reload
          plog.push(pr)
          if (!pr.ok) {
            hasErr = true
            break
          }
        }
        catch (err: any) {
          hasErr = true
          this.errs.push(err)
          break
        }
      }
    }

    // TODO: only reload if mode changed
    if (!hasErr || reload) {
      runlog.push('model:full')
      hasErr = await this.resolveModel()
    }

    if (!hasErr) {
      this.ctx.step = 'post'

      for (let producer of this.pdef) {
        try {
          runlog.push('producer:post:' + producer.build.name)
          let pr = await producer.build(this, this.ctx)
          plog.push(pr)
          if (!pr.ok) {
            hasErr = true
            break
          }
        }
        catch (err: any) {
          hasErr = true
          this.errs.push(err)
          break
        }
      }

    }

    const br: BuildResult =
    {
      // TODO: remove need for this
      build: () => this,

      ok: !hasErr,
      producers: plog,
      errs: this.errs,
      runlog
    }

    return br
  }


  async resolveModel() {
    let hasErr = false

    let src: string = ''
    if (!hasErr) {
      try {
        src = this.fs.readFileSync(this.path, 'utf8')
      }
      catch (err: any) {
        hasErr = true
        this.errs.push(err)
      }
    }

    if (!hasErr) {
      this.root = Aontu(src, this.opts)
      hasErr = this.root.err && 0 < this.root.err.length

      if (hasErr) {
        this.errs.push(...this.root.err)
      }
    }

    if (!hasErr) {
      let genctx = new Context({ root: this.root })
      this.model = this.root.gen(genctx)

      hasErr = genctx.err && 0 < genctx.err.length
      if (hasErr) {
        this.errs.push(...genctx.err)
      }
    }

    return hasErr
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



