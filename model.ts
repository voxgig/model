
import { Jsonic } from 'jsonic'
import { Dynamic } from 'jsonic/plugin/dynamic'
import { Multifile } from 'jsonic/plugin/multifile'


class Model {
  root: any = {}
  parse = Jsonic.make().use(Dynamic).use(Multifile)

  constructor(spec: any) {
    this.root = this.parse(spec.src, { fileName: spec.path })
  }

  get() {
    return this.root
  }
}


export { Model }


