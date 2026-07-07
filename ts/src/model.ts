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

import { initModel } from './init'


class Model {
  config?: Config
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
    if (this.log.isLevelEnabled('debug')) {
      this.log.debug({
        point: 'model-spec', mspec, note: '\n' +
          JSON.stringify({ ...mspec, src: '<NOT-SHOWN>' }, null, 2)
            .replace(/"/g, '')
            .replaceAll(process.cwd(), '.')
      })
    }

    // Config is a special Watch to handle model config. It is optional: when
    // mspec.config is false, the .model-config/ build is skipped entirely and
    // the model runs on its own (see run/start below).
    const useConfig = false !== mspec.config

    this.config = !useConfig ? undefined : makeConfig(mspec, this.log, this.fs, {
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
          // Point the config's last result at the current build so the model
          // producer reads fresh config state. It must be a thunk to satisfy
          // BuildResult.build's `() => Build` contract (consumers call it).
          const lastConfig = self.build.use?.config?.watch?.last
          if (lastConfig) {
            lastConfig.build = () => build
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
            Object.keys(watchmap).forEach((file: string) => {
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
      use: self.config ? { config: self.config } : {},
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


  // Run once. With config enabled, the config build runs first and triggers
  // the model build; without it, the model build runs directly.
  async run(): Promise<BuildResult> {
    this.trigger_model = false
    if (!this.config) {
      return this.watch.run('model', false, '<start>')
    }
    const br = await this.config.run(false)
    return br.ok ? this.watch.run('model', false, '<start>') : br
  }


  // Start watching for file changes. Runs an initial build, then watches
  // both the model files and (when enabled) the config files for ongoing
  // changes.
  async start() {
    this.trigger_model = false
    if (!this.config) {
      return this.watch.start()
    }
    const br = await this.config.run(true)
    if (!br.ok) {
      return br
    }
    // Watch config files too. The initial config build is already done
    // above, so start without forcing another one; a later config change
    // rebuilds the config and re-triggers the model build.
    this.config.start(false)
    return this.watch.start()
  }


  async stop() {
    // start() also spins up a config-file watcher; stop both so no
    // chokidar handle is left open keeping the process alive.
    await this.config?.stop()
    return this.watch.stop()
  }
}


function makeConfig(mspec: ModelSpec, log: Log, fs: any, trigger_model_build: ProducerDef) {
  let cbase = mspec.base + '/.model-config'
  let cpath = cbase + '/model-config.aontu'

  if (!fs.existsSync(cpath)) {
    fs.mkdirSync(cbase, { recursive: true })
    fs.writeFileSync(cpath, `
@"@voxgig/model/model/.model-config/model-config.aontu"

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
    'writev',
  ]

  const { fs } = MemFs({ [process.cwd()]: {} })

  for (let w of writers) {
    if ((fs as any)[w]) {
      (fsm as any)[w] = (fs as any)[w].bind(fs)
    }
  }

  // Also redirect the promise-based writers. fsm.promises is shared by
  // reference with the real fs module, so replace it with a copy rather
  // than mutating the caller's fs.
  const memPromises = (fs as any).promises
  if ((fsm as any).promises && memPromises) {
    const promises: any = { ...(fsm as any).promises }
    for (let w of writers) {
      if ('function' === typeof memPromises[w]) {
        promises[w] = memPromises[w].bind(memPromises)
      }
    }
    ;(fsm as any).promises = promises
  }

  return fsm
}


export {
  Model,
  BuildSpec,
  initModel,
}


