/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */


import type { BuildResult, Spec } from './types'

import { Watch } from './watch'

import { model_builder } from './builder/model'






class Config {
  build: any
  watch: Watch

  constructor(spec: Spec) {
    this.build = {
      src: spec.src,
      path: spec.path,
      base: spec.base,
      res: [
        ...(spec.res || [])
      ],
      require: spec.require
    }

    this.watch = new Watch(this.build)
  }

  async run(): Promise<BuildResult> {
    return this.watch.run(true, '<config>')
  }

  async start() {
    return this.watch.start()
  }

  async stop() {
    return this.watch.stop()
  }
}


export { Config, Spec }



