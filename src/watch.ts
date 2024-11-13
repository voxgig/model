/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */

import Path from 'node:path'


import type {
  Build,
  BuildResult,
  Log,
  Run,
  Canon,
  ChangeItem,
  BuildSpec
} from './types'

import { makeBuild } from './build'
import { FSWatcher } from 'chokidar'

import { readFile, stat } from 'fs/promises'


const print = console.log
const warn = console.warn



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

  constructor(wspec: BuildSpec, log: Log) {
    this.wspec = wspec
    this.log = log

    this.name = wspec.name || 'model'
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

    this.idle = wspec.idle || 111

    this.fsw.on('change', async (path: string) => {
      // console.log('CHANGE', Date.now() - this.startTime, path)
      this.handleChange(path)
    })
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

      // Only trigger a build if there was a actual change
      const trigger = this.lastChange.when !== this.lastTrigger.when &&
        this.lastChange.path !== this.lastTrigger.path

      // console.log('CHECK-A', {
      //   tick: (now - start),
      //   idleDuration,
      //   trigger,
      //   running: this.running,
      //   path: this.lastChange.path
      // })

      if (trigger) {

        // Only add to build queue if we've been idle.
        // This allows external compilation outputting multiple files to complete fully.
        // IMPORTANT: always trigger a new build if there were changes *inside* a build period
        if (this.idle < idleDuration) {
          this.lastTrigger.path = this.lastChange.path
          this.lastTrigger.when = this.lastChange.when

          const path = this.lastChange.path
          const canon = this.canon(path)

          this.runq.push({
            canon,
            path,
            start: now,
            end: -1,
          })

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
      // console.log('===DRAIN-RUN', this.runq.length, new Date(), r.start, r.canon)

      // TODO: collect results and errors!!!
      let br = await this.run(this.name, false, r.canon)
      // console.log('BR', br)

      r.end = Date.now()
      this.doneq.push(r)
      this.lastrun = r

      // console.log('===DRAIN-DONE', this.runq.length, new Date(), r.start, r.canon)
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

    // console.log('ADD', canon)
  }


  async update(br: BuildResult) {
    let build = (br.build as Build)

    let files: string[] =
      Object.keys(build.root.deps).reduce((files: string[], target: any) => {
        files = files.concat(Object.keys(build.root.deps[target]))
        return files
      }, [build.path])


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



  async run(name: string, once?: boolean, trigger?: string): Promise<BuildResult> {
    // console.trace()

    this.lastChangeTime = Date.now()
    // print('\n@voxgig/model =================', this.lastChangeTime, new Date(this.lastChangeTime))
    // print('TRIGGER:', trigger, '\n')

    this.log.info({
      point: 'build-start', last: this.lastChangeTime, watch: name,
      note: 'watch:' + name + ' last:' + new Date(this.lastChangeTime).toISOString()
    })
    this.log.info({
      point: 'build-trigger', trigger,
      note: 'watch:' + name + ' trigger:' + ('' + trigger).replace(process.cwd() + '/', '')
    })

    // TODO: build spec should not have src!
    let src = (await readFile(this.wspec.path)).toString()
    this.wspec.src = src

    this.build = this.build || makeBuild(this.wspec, this.log)

    // TODO: better way to do this?
    this.build.src = src

    let br: BuildResult = await this.build.run()

    // print('\nFILES:\n' + this.descDeps((br as any).build.root.deps) + '\n')
    const deps = this.descDeps((br as any).build.root.deps)
    this.log.debug({
      point: 'deps', deps,
      note: 'watch:' + name + ' deps:\n' + deps
    })


    if (br.ok) {
      const rootkeys = Object.keys(br?.build?.model).join(';')
      this.log.info({
        point: 'root-keys', keys: rootkeys,
        note: 'watch:' + name + ' keys: ' + rootkeys
      })

      // print('TOP:', Object.keys(br?.build?.model).join(', '), '\n')

      if (!once) {
        // There may be new files.
        await this.update(br)
      }
    }
    else {
      warn('MODEL ERRORS: ' + br.err?.length)
      this.handleErrors(br)
    }

    this.last = br

    this.log.info({
      point: 'build-end', watch: name,
      note: 'watch:' + name + '\n',
    })


    return br
  }


  async stop() {
    await this.fsw.close()
  }


  handleErrors(br: BuildResult) {
    if (br.err) {
      for (let be of br.err) {
        // TODO: print stack if not a model error

        if (be.isVal && be.msg) {
          warn(be.msg)
        }
        // else if (be.message) {
        //   warn(be.message)
        // }
        else {
          warn(be)
        }
      }
    }
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