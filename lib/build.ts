/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */


import { Aontu, Val, Nil, Context } from 'aontu'


interface BuildResult {
  ok: boolean
  builder?: string
  path?: string
  build?: Build
  builders?: BuildResult[]
  err?: any[]
}

interface BuildAction {
  path: string
  build: Builder
}

type Builder = (
  build: Build
) => Promise<BuildResult>


interface Spec {
  src: string
  path?: string
  base?: string
  res?: BuildAction[]
  require?: any
  use?: { [name: string]: any }
}




class Build {
  src: string
  base: string
  path: string
  root: Val = Nil.make()
  opts: { [key: string]: any }
  res: BuildAction[]
  spec: Spec
  model: any
  use: { [name: string]: any } = {}
  err: any[] = []


  constructor(spec: Spec) {
    this.spec = spec
    this.src = spec.src
    this.base = null == spec.base ? '' : spec.base
    this.path = null == spec.path ? '' : spec.path
    this.opts = {}

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

    this.root = Aontu(this.src, this.opts)
    hasErr = this.root.err && 0 < this.root.err.length

    if (hasErr) {
      this.err.push(...this.root.err)
    }


    let brlog = []

    if (!hasErr) {
      let genctx = new Context({ root: this.root })
      this.model = this.root.gen(genctx)

      hasErr = genctx.err && 0 < genctx.err.length
      if (hasErr) {
        this.err.push(...genctx.err)
      }
      else {

        // TODO: only call if path value has changed
        for (let builder of this.res) {
          try {
            let br = await builder.build(this)
            br.path = builder.path
            br.builder = builder.build.name
            brlog.push(br)
          }
          catch (e: any) {
            this.err.push(e)
          }
        }
      }
    }

    return { ok: !hasErr, build: this, builders: brlog, err: this.err }
  }
}


export {
  Build,
  Builder,
  BuildResult,
  BuildAction,
  Spec,
  Val
}


