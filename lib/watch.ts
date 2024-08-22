/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */

import Path from 'node:path'


import type { Build, BuildResult } from './types'

import { makeBuild } from './build'
import { FSWatcher } from 'chokidar'

import { readFile } from 'fs/promises'


const print = console.log
const warn = console.warn


class Watch {
  fsw: FSWatcher
  spec: any
  last?: BuildResult
  last_change_time: number
  build: Build | undefined

  constructor(spec: any) {
    this.spec = spec
    this.fsw = new FSWatcher()
    this.last_change_time = 0

    const run = this.run.bind(this)

    this.fsw.on('change', () => {

      // TODO: needs a much more robust queue that checks for dups,
      // otherwise BuildContext state will have concurrency corruptions
      // Avoid rebuilding when, for example, TS rewrites all files in dist
      if (1 < Date.now() - this.last_change_time) {
        run()
      }
    })
  }


  add(file: string) {
    if (!Path.isAbsolute(file)) {
      file = Path.join(this.spec.require, file)
    }
    this.fsw.add(file)
  }


  update(br: BuildResult) {
    let build = (br.build as Build)

    let files: string[] =
      Object.keys(build.root.deps).reduce((files: string[], target: any) => {
        files = files.concat(Object.keys(build.root.deps[target]))
        return files
      }, [build.path])


    // TODO: remove deleted files
    files.forEach((file: string) => {
      if ('string' === typeof (file) &&
        '' !== file &&
        build.opts.base !== file
      ) {
        this.fsw.add(file)
      }
    })

  }


  // Returns first BuildResult
  async start(): Promise<BuildResult> {
    return await this.run(false)
  }


  async run(once?: boolean): Promise<BuildResult> {
    this.last_change_time = Date.now()
    print('\n@voxgig/model', new Date(this.last_change_time))

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
        this.update(br)
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
        if (be.msg) {
          warn(be.msg)
        }
        else if (be.message) {
          warn(be.message)
        }
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
