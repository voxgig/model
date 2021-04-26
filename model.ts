

import { FileResolver } from '@jsonic/multisource/dist/resolver/file'

import { Aontu, Val } from 'aontu'


class Model {
  root: Val

  parse = Aontu

  constructor(spec: any) {
    this.root = this.parse(spec.src, {
      resolver: FileResolver,
    })
  }

  get() {
    return this.root.gen([])
  }
}


export { Model }


