

import { Build, BuildResult } from './lib/build'
import { Watch } from './lib/watch'


import { model_builder } from './lib/builder/model'


interface Spec {
  src: string,
  path: string,
  base: string,
}


class Model {
  build: any
  watch: Watch

  constructor(spec: Spec) {
    this.build = {
      src: spec.src,
      path: spec.path,
      base: spec.base,
      res: [
        {
          path: '/',
          build: model_builder
        },
      ]
    }

    this.watch = new Watch(this.build)
  }

  async run(): Promise<BuildResult> {
    return this.watch.run(true)
  }

  async start() {
    return this.watch.start()
  }

  async stop() {
    return this.watch.stop()
  }
}


export { Model, Spec }


