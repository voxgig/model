
/*
import { Jsonic } from 'jsonic'
import { Dynamic } from 'jsonic/plugin/dynamic'
import { Multifile } from 'jsonic/plugin/multifile'
*/

import { Aontu, Val } from 'aontu'


class Model {
  root: Val
  //parse = Jsonic.make().use(Dynamic).use(Multifile)
  parse = Aontu

  constructor(spec: any) {
    this.root = this.parse(spec.src) //, { fileName: spec.path })
  }

  get() {
    return this.root.gen([])
  }
}


export { Model }


