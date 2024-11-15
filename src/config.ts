/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */


import type { BuildResult, BuildSpec, Log } from './types'

import { Watch } from './watch'



class Config {
  build: BuildSpec
  watch: Watch
  log: Log

  constructor(spec: BuildSpec, log: Log) {
    this.log = log

    this.build = {
      path: spec.path,
      base: spec.base,
      res: [
        ...(spec.res || [])
      ],
      require: spec.require,
      log: this.log,
      fs: spec.fs
    }

    this.watch = new Watch(this.build, this.log)
  }

  async run(watch: boolean): Promise<BuildResult> {
    return this.watch.run('config', watch, '<config>')
  }

  async start() {
    return this.watch.start()
  }

  async stop() {
    return this.watch.stop()
  }
}


export { Config, BuildSpec }



