/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Path from 'node:path'


import type {
  Build,
  BuildResult,
  Log,
  Run,
  Canon,
  ChangeItem,
  BuildSpec,
  RunSpec,
} from './types'

import { makeBuild } from './build'
import { FSWatcher } from 'chokidar'

import { stat } from 'fs/promises'



class Watch {
  fsw: FSWatcher
  wspec: any
  last?: BuildResult
  lastChangeTime: number
  build: Build | undefined
  runq: Run[]
  doneq: Run[]
  canons: Canon[]
  lastrun: Run | undefined
  idle: number
  startTime: number
  running: boolean
  lastChange: ChangeItem
  lastTrigger: ChangeItem
  log: Log
  name: string
  mode: {
    mod: boolean // file modification
    add: boolean // file addition
    rem: boolean // file deletion
  }

  constructor(bspec: BuildSpec, log: Log) {
    this.wspec = bspec
    this.log = log

    this.name = bspec.name || 'model'
    this.fsw = new FSWatcher()
    this.lastChangeTime = 0
    this.runq = []
    this.doneq = []
    this.canons = []
    this.startTime = 0
    this.lastChange = { path: '', when: 0 }
    this.lastTrigger = { path: '', when: 0 }
    this.running = false
    this.lastrun = undefined

    this.idle = bspec.idle || 111

    this.mode = {
      mod: null == bspec.watch?.mod ? true : true == bspec.watch?.mod,
      add: true === bspec.watch?.add,
      rem: true === bspec.watch?.rem,
    }

    const handleChange = this.handleChange.bind(this)

    if (this.mode.mod) {
      this.fsw.on('change', handleChange)
    }

    if (this.mode.add) {
      this.fsw.on('add', handleChange)
    }

    if (this.mode.rem) {
      this.fsw.on('unlink', handleChange)
    }
  }


  // Returns first BuildResult
  start() {
    this.startTime = Date.now()
    this.handleChange('<start>')

    // Check if there have been no recent changes, if so, run build.
    setInterval(() => {
      // const start = this.startTime
      const now = Date.now()
      const idleDuration = now - this.lastChange.when

      // Only trigger a build if there was an actual change
      const trigger = this.lastChange.when !== this.lastTrigger.when // &&
      // this.lastChange.path !== this.lastTrigger.path

      if (trigger) {
        // console.log('TRIGGER', this.idle < idleDuration, this.idle, idleDuration)

        // Only add to build queue if we've been idle.
        // This allows external compilation outputting multiple files to complete fully.
        // IMPORTANT: always trigger a new build if there were changes *inside* a build period
        if (this.idle < idleDuration) {
          this.lastTrigger.path = this.lastChange.path
          this.lastTrigger.when = this.lastChange.when

          const path = this.lastChange.path
          const canon = this.canon(path)

          const entry = {
            canon,
            path,
            start: now,
            end: -1,
          }
          // console.log('RUNQ ENTRY', entry)
          this.runq.push(entry)

          // Defer builds to the event loop to keep idle checking separate.
          setImmediate(this.drain.bind(this))
        }
      }

    }, (this.idle * 1.1 / 2) | 0)
  }


  // If path is inside a watched folder, return folder as canonical reference.
  canon(path: string) {
    for (const canon of this.canons) {
      if (canon.isFolder && path.startsWith(canon.path)) {
        return canon.path
      }
    }
    return path
  }


  handleChange(path: string) {
    // Record most recent (last) changed path and time
    this.lastChange.path = path
    this.lastChange.when = Date.now()
  }


  async drain() {
    // If already running, all items in queue will be drained from this.runq in the while loop
    if (this.running) {
      return
    }

    this.running = true
    let r: Run | undefined

    // While there are queued runs, run them sequentially
    while (r = this.runq.shift()) {
      let br = await this.run(this.name, true, r.canon)
      r.result = br
      r.end = Date.now()
      this.doneq.push(r)
      this.lastrun = r
    }
    this.running = false
  }


  async add(path: string) {
    if (!Path.isAbsolute(path)) {
      path = Path.join(this.wspec.require, path)
    }

    // Ignore if aleady added
    if (this.canons.find((c: Canon) => c.path === path)) {
      return
    }

    const fileStat = await stat(path)
    const canon: Canon = {
      path: path,
      isFolder: fileStat.isDirectory(),
      when: Date.now()
    }

    this.canons.push(canon)

    this.fsw.add(path)
  }


  async update(br: BuildResult) {
    let build = br.build ? br.build() : undefined

    // console.log('UPDATE BR BUILD', build)

    if (build?.root?.deps) {
      let files: string[] =
        Object.keys(build.root.deps).reduce((files: string[], target: any) => {
          files = files.concat(Object.keys(build.root.deps[target]))
          return files
        }, [build.path])

      // console.log('DEPS', files)

      // TODO: remove deleted files
      files.forEach(async (file: string) => {
        if ('string' === typeof (file) &&
          '' !== file &&
          build.opts.base !== file
        ) {
          await this.add(file)
        }
      })
    }
  }


  async run(name: string, watch?: boolean, trigger?: string): Promise<BuildResult> {
    try {
      this.lastChangeTime = Date.now()

      this.log.info({
        point: 'build-start', last: this.lastChangeTime, watch: name,
        note: 'watch:' + name + ' last:' + new Date(this.lastChangeTime).toISOString()
      })
      this.log.info({
        point: 'build-trigger', trigger,
        note: 'watch:' + name + ' trigger:' + ('' + trigger).replace(process.cwd() + '/', '')
      })

      this.build = this.build || makeBuild(this.wspec, this.log)

      let rspec: RunSpec = { watch: true === watch }
      let br: BuildResult = await this.build.run(rspec)

      if (br.ok) {
        const deps = this.descDeps(br.build ? br.build().root?.deps : undefined)
        this.log.debug({
          point: 'deps', deps,
          note: 'watch:' + name + ' deps:\n' + deps
        })

        const rootkeys = Object.keys(this.build.model).join(';')
        this.log.info({
          point: 'root-keys', keys: rootkeys,
          note: 'watch:' + name + ' keys: ' + rootkeys
        })

        if (watch) {
          // There may be new files.
          await this.update(br)
        }

        this.log.info({
          point: 'build-end', watch: name,
          note: 'watch:' + name + '\n',
        })
      }
      else {
        let errs = br.errs || [new Error('Unknown build error')]
        errs.filter(err => !err.__logged__).map((err: any) => {
          this.log.error({
            fail: 'build', point: 'run-build', build: this, err
          })
          err.__logged__ = true
        })
      }

      this.last = br

      return br
    }
    catch (err: any) {
      if (!err.__logged__) {
        this.log.error({
          fail: 'build', point: 'run-build', build: this, err
        })
        err.__logged__ = true
      }

      let br = {
        ok: false,
        errs: [err],
        runlog: []
      }

      return br
    }
  }


  async stop() {
    await this.fsw.close()
  }


  descDeps(deps: Record<string, Record<string, { tar: string }>>) {
    if (null == deps) {
      return ''
    }

    let cwd = process.cwd()
    let desc = []
    for (let entryPath of Object.keys(deps)) {
      desc.push('  ' + entryPath)
      for (let depPath of Object.keys(deps[entryPath])) {
        depPath = depPath.replace(cwd, '.')
        desc.push('    ' + depPath)
      }
    }
    return desc.join('\n')
  }
}


export {
  Watch
}
