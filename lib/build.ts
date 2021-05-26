

import { makeFileResolver } from '@jsonic/multisource'


import { Aontu, Val, Nil } from 'aontu'


interface BuildResult {
  ok: boolean
  builder?: string
  path?: string
  build?: Build
  builders?: BuildResult[]
}

type Builder = (
  build: Build
) => Promise<BuildResult>


interface Spec {
  src: string,
  path?: string,
  base?: string,
  res?: { path: string, build: Builder }[]
}


class Build {
  src: string
  base: string
  path: string
  root: Val = Nil.make()
  opts: { [key: string]: any }
  res: { path: string, build: Builder }[]
  spec: Spec
  model: any


  constructor(spec: Spec) {
    this.spec = spec
    this.src = spec.src
    this.base = null == spec.base ? '' : spec.base
    this.path = null == spec.path ? '' : spec.path
    this.opts = {}

    if (null != spec.base) {
      this.opts.base = spec.base
      this.opts.resolver = makeFileResolver()
    }

    this.res = spec.res || []
  }


  async run(): Promise<BuildResult> {
    console.log('BUILDING ' + new Date() + ' ...')

    this.root = Aontu(this.src, this.opts)

    let nil = (this.root as Nil)
    console.log('MODEL: ' + (nil.nil ? nil.why : 'ok'))

    // console.log('MODEL DEPS', this.root.deps)

    this.model = this.root.gen([])


    // TODO: only call if path value has changed
    let brlog = []
    for (let builder of this.res) {
      let br = await builder.build(this)
      br.path = builder.path
      br.builder = builder.build.name
      brlog.push(br)
    }

    return { ok: true, build: this, builders: brlog }
  }
}


export { Build, Builder, BuildResult, Spec, Val }


