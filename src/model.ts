/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */

// TODO: remove need for this
import Fs from 'node:fs'

import { prettyPino, Pino } from '@voxgig/util'

import type {
  Build,
  BuildResult,
  BuildAction,
  BuildContext,
  BuildSpec,
  Log
} from './types'


import { Config } from './config'
import { Watch } from './watch'

import { model_builder } from './builder/model'
import { local_builder } from './builder/local'


class Model {
  config: Config
  build: BuildSpec
  watch: Watch

  trigger_model = false

  log: Log

  constructor(spec: BuildSpec) {
    const self = this

    const pino = prettyPino('model', spec as any)

    this.log = pino.child({ cmp: 'model' })

    this.log.info({ point: 'model-init' })
    this.log.debug({
      point: 'model-spec', spec, note: '\n' +
        JSON.stringify({ ...spec, src: '<NOT-SHOWN>' }, null, 2)
          .replace(/"/g, '')
          .replaceAll(process.cwd(), '.')
    })

    // Config is a special Watch to handle model config.
    this.config = makeConfig(spec, this.log, {
      path: '/',
      build: async function trigger_model(build: Build, ctx: BuildContext) {
        if ('post' !== ctx.step) {
          return { ok: true }
        }

        let res

        // console.log('TRIGGER', build.id, self.trigger_model, ctx)
        // console.log(new Error().stack)

        if (self.trigger_model) {

          // TODO: better design
          if (self.build.use) {
            self.build.use.config.watch.last.build = build
          }

          res = self.watch.run('model', true)
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
      require: spec.require,
      log: this.log,
    }


    this.watch = new Watch(self.build, this.log)
  }


  async run(): Promise<BuildResult> {
    this.trigger_model = false
    const br = await this.config.run()
    return br.ok ? this.watch.run('model', true) : br
  }


  async start() {
    this.trigger_model = false

    const br = await this.config.run()
    // console.log('MODEL CONFIG START', br.ok)
    return br.ok ? this.watch.start() : br
  }


  async stop() {
    return this.watch.stop()
  }
}


function makeConfig(spec: BuildSpec, log: Log, trigger_model_build: BuildAction) {
  let cbase = spec.base + '/.model-config'
  let cpath = cbase + '/model-config.jsonic'

  // Build should load file
  let src = Fs.readFileSync(cpath).toString()

  let cspec: BuildSpec = {
    name: 'config',
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
    require: spec.require,
    log,
  }

  return new Config(cspec, log)
}



export {
  Model,
  BuildSpec,
}


