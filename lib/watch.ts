/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */

import Path from 'node:path'


import type { Build, BuildResult } from './types'

import { makeBuild } from './build'
import { FSWatcher } from 'chokidar'

import { readFile, stat } from 'fs/promises'


const print = console.log
const warn = console.warn


type Run = {
  canon: string
  path: string
  start: number
  end: number
}

type Canon = {
  path: string
  isFolder: boolean
  when: number
}

class Watch {
  fsw: FSWatcher
  spec: any
  last?: BuildResult
  last_change_time: number
  build: Build | undefined
  runq: Run[]
  doneq: Run[]
  canons: Canon[]
  running: boolean

  constructor(spec: any) {
    this.spec = spec
    this.fsw = new FSWatcher()
    this.last_change_time = 0
    this.runq = []
    this.doneq = []
    this.canons = []
    this.running = false

    // const run = this.run.bind(this)
    const drain = this.drain.bind(this)

    this.fsw.on('change', async (path: string) => {
      // TODO: needs a much more robust queue that checks for dups,
      // otherwise BuildContext state will have concurrency corruptions
      // Avoid rebuilding when, for example, TS rewrites all files in dist
      // const dorun = 1111 < Date.now() - this.last_change_time
      // console.log('CHANGE', dorun, this.last_change_time, args)

      const canon = this.canon(path)

      const running = this.runq.find((run: Run) => run.canon === canon)
      if (running) {
        // console.log('RUNNING', canon, path)
        return
      }

      this.runq.push({
        canon,
        path,
        start: Date.now(),
        end: -1,
      })

      // console.log('RUNQ-ADD', this.runq)
      setImmediate(drain)
    })
  }


  async drain() {
    if (this.running) {
      return
    }

    this.running = true
    let r
    while (r = this.runq[0]) {
      // console.log('DRAIN')
      let br = await this.run(false, r.canon)
      // console.log('BR', br)
      this.runq.shift()
      r.end = Date.now()

      this.doneq.push(r)

      // console.log('DONEQ', this.doneq)
    }
    this.running = false
  }


  async add(path: string) {
    if (!Path.isAbsolute(path)) {
      path = Path.join(this.spec.require, path)
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


  // If path is inside a watched folder, return folder as canonical reference.
  canon(path: string) {
    for (const canon of this.canons) {
      if (canon.isFolder && path.startsWith(canon.path)) {
        return canon.path
      }
    }
    return path
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


  // Returns first BuildResult
  async start(): Promise<BuildResult> {
    return await this.run(false, '<start>')
  }


  async run(once?: boolean, trigger?: string): Promise<BuildResult> {
    // console.trace()

    this.last_change_time = Date.now()
    print('\n@voxgig/model', this.last_change_time, new Date(this.last_change_time))
    print('TRIGGER:', trigger, '\n')

    // TODO: build spec should not have src!
    let src = (await readFile(this.spec.path)).toString()
    this.spec.src = src

    this.build = this.build || makeBuild(this.spec)

    // TODO: better way to do this?
    this.build.src = src

    let br: BuildResult = await this.build.run()

    print('\nFILES:\n' + this.descDeps((br as any).build.root.deps) + '\n')

    if (br.ok) {
      print('TOP:', Object.keys(br?.build?.model).join(', '), '\n')

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

    let desc = []
    for (let entryPath of Object.keys(deps)) {
      desc.push('  ' + entryPath)
      for (let depPath of Object.keys(deps[entryPath])) {
        desc.push('    ' + depPath)
      }
    }
    return desc.join('\n')
  }
}


export {
  Watch
}
