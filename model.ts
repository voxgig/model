/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */

// TODO: remove need for this
import Fs from 'fs'

import { Config } from './lib/config'
import { Build, BuildAction, BuildResult, Spec } from './lib/build'
import { Watch } from './lib/watch'

import { model_builder } from './lib/builder/model'
import { local_builder } from './lib/builder/local'

import {
  dive,
  joins,
  get,
  pinify,
  camelify,
} from './lib/util'


const intern = makeIntern()

class Model {
  config: Config
  build: any
  watch: Watch

  trigger_model = false


  constructor(spec: Spec) {

    // Config is a special Watch to handle model config.
    this.config = intern.makeConfig(spec, {
      path: '/',
      build: async (build: Build) => {

        if (this.trigger_model) {

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


    // The actual model.
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
      ],
      require: spec.require
    }


    this.watch = new Watch(this.build)
  }

  async run(): Promise<BuildResult> {
    this.trigger_model = false
    let br = await this.config.run()
    return br.ok ? this.watch.run(true) : br
  }

  async start() {
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

          trigger_model_build
        ],
        require: spec.require
      }

      return new Config(cspec)
    }
  }
}


export {
  Model,
  Spec,
  dive,
  joins,
  get,
  pinify,
  camelify,
}


