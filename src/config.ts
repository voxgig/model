/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */


import type { BuildResult, BuildSpec, Log } from './types'

import { Watch } from './watch'



class Config {
  build: any
  watch: Watch
  log: Log

  constructor(spec: BuildSpec, log: Log) {
    this.log = log

    this.build = {
      src: spec.src,
      path: spec.path,
      base: spec.base,
      res: [
        ...(spec.res || [])
      ],
      require: spec.require,
      log: this.log,
    }

    this.watch = new Watch(this.build, this.log)
  }

  async run(): Promise<BuildResult> {
    return this.watch.run('config', true, '<config>')
  }

  async start() {
    return this.watch.start()
  }

  async stop() {
    return this.watch.stop()
  }
}


export { Config, BuildSpec }



