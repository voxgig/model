/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */


import Fs from 'node:fs'

import { prettyPino } from '@voxgig/util'

import type {
  Build,
  BuildResult,
  BuildAction,
  BuildContext,
  BuildSpec,
  ModelSpec,
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
  fs: any

  constructor(mspec: ModelSpec) {
    const self = this
    self.fs = mspec.fs || Fs

    const pino = prettyPino('model', mspec as any)

    this.log = pino.child({ cmp: 'model' })

    this.log.info({ point: 'model-init' })
    this.log.debug({
      point: 'model-spec', mspec, note: '\n' +
        JSON.stringify({ ...mspec, src: '<NOT-SHOWN>' }, null, 2)
          .replace(/"/g, '')
          .replaceAll(process.cwd(), '.')
    })

    // Config is a special Watch to handle model config.
    this.config = makeConfig(mspec, this.log, this.fs, {
      path: '/',
      build: async function trigger_model(build: Build, ctx: BuildContext) {
        if ('post' !== ctx.step) {
          return { ok: true, errs: [], runlog: [] }
        }

        let res: BuildResult = { ok: false, errs: [], runlog: [] }

        if (self.trigger_model) {

          // TODO: better design
          if (self.build.use) {
            self.build.use.config.watch.last.build = build
          }

          res = await self.watch.run('model', true)
        }
        else {
          self.trigger_model = true
          res = { ok: true, errs: [], runlog: [] }
        }

        if (ctx.watch) {
          const watchmap = build.model?.sys?.model?.watch

          if (watchmap) {
            Object.keys(watchmap).map((file: string) => {
              self.watch.add(file)
            })
          }
        }

        return res
      }
    })

    // The actual model.
    this.build = {
      path: mspec.path,
      base: mspec.base,
      debug: mspec.debug,
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
      require: mspec.require,
      log: this.log,
      fs: this.fs,
      watch: mspec.watch,
    }

    this.watch = new Watch(self.build, this.log)
  }


  // Run once.
  async run(): Promise<BuildResult> {
    this.trigger_model = false
    const br = await this.config.run(false)
    return br.ok ? this.watch.run('model', false, '<start>') : br
  }


  // Start watching for file changes. Run once initially.
  async start() {
    this.trigger_model = false
    const br = await this.config.run(true)
    return br.ok ? this.watch.start() : br
  }


  async stop() {
    return this.watch.stop()
  }
}


function makeConfig(mspec: ModelSpec, log: Log, fs: any, trigger_model_build: BuildAction) {
  let cbase = mspec.base + '/.model-config'
  let cpath = cbase + '/model-config.jsonic'

  if (!Fs.existsSync(cpath)) {
    Fs.mkdirSync(cbase, { recursive: true })
    Fs.writeFileSync(cpath, `
@"@voxgig/model/model/.model-config/model-config.jsonic"

sys: model: builders: {}
`)
  }

  let cspec: BuildSpec = {
    name: 'config',
    path: cpath,
    base: cbase,
    debug: mspec.debug,
    res: [

      // Generate full config model and save as a file.
      {
        path: '/',
        build: model_builder
      },

      // Trigger main model build.
      trigger_model_build
    ],
    require: mspec.require,
    log,
    fs,
  }

  return new Config(cspec, log)
}



export {
  Model,
  BuildSpec,
}


