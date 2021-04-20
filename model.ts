
import { Jsonic } from 'jsonic'
import { Dynamic } from 'jsonic/plugin/dynamic'


class Model {
  root: any = {}
  parse = Jsonic.make().use(Dynamic)

  constructor(spec: any) {
    this.root = this.parse(spec.src, { fileName: spec.path })
  }

  get() {
    return this.root
  }
}


export { Model }


