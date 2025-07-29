/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */


import * as NodeFs from 'node:fs'

import { memfs as MemFs } from 'memfs'

import { prettyPino } from '@voxgig/util'

import type {
  Build,
  BuildResult,
  ProducerDef,
  BuildContext,
  BuildSpec,
  ModelSpec,
  Log,
  FST,
  ProducerResult,
} from './types'


import { Config } from './config'
import { Watch } from './watch'

import { model_producer } from './producer/model'
import { local_producer } from './producer/local'


class Model {
  config: Config
  build: BuildSpec
  watch: Watch

  trigger_model = false

  log: Log
  fs: any

  constructor(mspec: ModelSpec) {
    const self = this

    this.fs = { ...(mspec.fs || NodeFs) }

    if (mspec.dryrun) {
      makeReadOnly(this.fs)
    }

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
        let pres: ProducerResult = {
          ok: false, name: 'config', step: '', active: true, reload: false, errs: [], runlog: []
        }

        if ('post' !== ctx.step) {
          pres.ok = true
          return pres
        }


        if (self.trigger_model) {

          // TODO: better design
          if (self.build.use) {
            self.build.use.config.watch.last.build = build
          }

          const br = await self.watch.run('model', true)
          pres.ok = br.ok
          pres.errs = br.errs
        }
        else {
          self.trigger_model = true
          pres.ok = true
        }

        if (ctx.watch) {
          const watchmap = build.model?.sys?.model?.watch

          if (watchmap) {
            Object.keys(watchmap).map((file: string) => {
              self.watch.add(file)
            })
          }
        }

        return pres
      }
    })

    // The actual model.
    this.build = {
      path: mspec.path,
      base: mspec.base,
      debug: mspec.debug,
      dryrun: mspec.dryrun,
      buildargs: mspec.buildargs,
      use: { config: self.config },
      res: [
        {
          path: '/',
          build: model_producer
        },
        {
          path: '/',
          build: local_producer
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


function makeConfig(mspec: ModelSpec, log: Log, fs: any, trigger_model_build: ProducerDef) {
  let cbase = mspec.base + '/.model-config'
  let cpath = cbase + '/model-config.jsonic'

  if (!fs.existsSync(cpath)) {
    fs.mkdirSync(cbase, { recursive: true })
    fs.writeFileSync(cpath, `
@"@voxgig/model/model/.model-config/model-config.jsonic"

sys: model: action: {}
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
        build: model_producer
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


function makeReadOnly(fsm: FST) {

  // NOTE: NOT COMPLETE!
  // Just for internal use,
  const writers = [
    'writeFile',
    'writeFileSync',
    'appendFile',
    'appendFileSync',
    'chmod',
    'chmodSync',
    'chown',
    'chownSync',
    'cp',
    'cpSync',
    'createWriteStream',
    'mkdir',
    'mkdirSync',
    'rename',
    'renameSync',
    'rm',
    'rmSync',
    'rmdir',
    'rmdirSync',
    'symlink',
    'symlinkSync',
    'truncate',
    'truncateSync',
    'unlink',
    'unlinkSync',
    'write',
    'writeFile',
    'writeFileSync',
    'writev',
  ]

  const { fs } = MemFs({ [process.cwd()]: {} })

  for (let w of writers) {
    if ((fs as any)[w]) {
      (fsm as any)[w] = (fs as any)[w].bind(fs)
    }
  }

  return fsm
}


export {
  Model,
  BuildSpec,
}


