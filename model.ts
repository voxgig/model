

import { makeFileResolver } from '@jsonic/multisource'



import { Aontu, Val } from 'aontu'



interface Spec {
  src: string,
  base?: string,
}


class Model {
  root: Val

  parse = Aontu

  constructor(spec: Spec) {
    let opts: any = {}

    if (null != spec.base) {
      opts.base = spec.base
      opts.resolver = makeFileResolver()
    }

    // console.log('OPTS', opts)

    this.root = this.parse(spec.src, opts)

    console.log('MODEL MAP', this.root.map)
  }

  get() {
    return this.root.gen([])
  }
}


export { Model, Spec }


