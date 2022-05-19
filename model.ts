/* Copyright © 2021-2022 Voxgig Ltd, MIT License. */

// TODO: remove need for this
import Fs from 'fs'

import { Config } from './lib/config'
import { Build, BuildAction, BuildResult, Spec } from './lib/build'
import { Watch } from './lib/watch'

import { model_builder } from './lib/builder/model'
import { local_builder } from './lib/builder/local'


const intern = makeIntern()

class Model {
  config: Config
  build: any
  watch: Watch

  trigger_model = false


  constructor(spec: Spec) {
    this.config = intern.makeConfig(spec, {
      path: '/',
      build: async (build: Build) => {
        console.log('TRIGGER MODEL', this.trigger_model)

        if (this.trigger_model) {
          console.log('CONFIG CHANGE')//, this)
          // console.trace()
          // rebuild if config changes

          // TODO: fix!!!
          this.build.use.config.watch.last.build = build

          return this.watch.run(true)
        }
        else {
          this.trigger_model = true
          return { ok: true }
        }
      }
    })



    this.build = {
      src: spec.src,
      path: spec.path,
      base: spec.base,
      use: { config: this.config },
      res: [
        {
          path: '/',
          build: model_builder
        },


        {
          path: '/',
          build: local_builder
        }
      ]
    }

    this.watch = new Watch(this.build)
  }

  async run(): Promise<BuildResult> {
    this.trigger_model = false
    let br = await this.config.run()
    return br.ok ? this.watch.run(true) : br
  }

  async start() {
    console.log('MODEL START')
    this.trigger_model = false
    await this.config.start()

    return this.watch.start()
  }

  async stop() {
    return this.watch.stop()
  }
}


function makeIntern() {
  return {
    makeConfig(spec: Spec, trigger_model_build: BuildAction) {
      let cbase = spec.base + '/config'
      let cpath = cbase + '/config.jsonic'

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

          trigger_model_build
        ]
      }
      return new Config(cspec)
    }
  }
}


export { Model, Spec }


