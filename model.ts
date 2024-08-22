/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */

// TODO: remove need for this
import Fs from 'fs'


import type { Build, BuildResult, BuildAction, BuildContext, Spec } from './lib/types'


import { Config } from './lib/config'
import { Watch } from './lib/watch'

import { model_builder } from './lib/builder/model'
import { local_builder } from './lib/builder/local'


class Model {
  config: Config
  build: any
  watch: Watch

  trigger_model = false


  constructor(spec: Spec) {
    const self = this

    // Config is a special Watch to handle model config.
    this.config = makeConfig(spec, {
      path: '/',
      build: async function trigger_model(build: Build, ctx: BuildContext) {
        if ('post' !== ctx.step) {
          return { ok: true }
        }

        let res

        // console.log('TRIGGER', build.id, self.trigger_model, ctx)
        // console.log(new Error().stack)

        if (self.trigger_model) {

          // TODO: fix!!!
          self.build.use.config.watch.last.build = build

          res = self.watch.run(true)
        }
        else {
          self.trigger_model = true
          res = { ok: true }
        }

        const watchmap = build.model?.sys?.model?.watch

        if (watchmap) {
          Object.keys(watchmap).map((file: string) => {
            self.watch.add(file)
          })
        }

        return res
      }
    })


    // The actual model.
    this.build = {
      src: spec.src,
      path: spec.path,
      base: spec.base,
      use: { config: self.config },
      res: [
        {
          path: '/',
          build: model_builder
        },
        {
          path: '/',
          build: local_builder
        }
      ],
      require: spec.require
    }


    this.watch = new Watch(self.build)
  }


  async run(): Promise<BuildResult> {
    this.trigger_model = false
    const br = await this.config.run()
    return br.ok ? this.watch.run(true) : br
  }


  async start(): Promise<BuildResult> {
    this.trigger_model = false
    const br = await this.config.start()
    return br.ok ? this.watch.start() : br
  }


  async stop() {
    return this.watch.stop()
  }
}


function makeConfig(spec: Spec, trigger_model_build: BuildAction) {
  let cbase = spec.base + '/.model-config'
  let cpath = cbase + '/model-config.jsonic'

  // Build should load file
  let src = Fs.readFileSync(cpath).toString()

  let cspec: Spec = {
    src: src,
    path: cpath,
    base: cbase,
    res: [

      // Generate full config model and save as a file.
      {
        path: '/',
        build: model_builder
      },

      // Trigger main model build.
      trigger_model_build
    ],
    require: spec.require
  }

  return new Config(cspec)
}



export {
  Model,
  Spec,
}


