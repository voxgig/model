/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */


// load config as a model
// from model / config.jsonic by default
// config defines builders




import { BuildResult, Spec } from './build'
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
        {
          path: '/',
          build: model_builder
        },
        ...(spec.res || [])
      ],
      require: spec.require
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


export { Config, Spec }



