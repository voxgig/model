/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */


import { Build, BuildResult } from './build'
import { FSWatcher } from 'chokidar'

import { readFile } from 'fs/promises'


class Watch {
  fsw: FSWatcher
  spec: any
  last?: BuildResult

  constructor(spec: any) {
    this.spec = spec
    this.fsw = new FSWatcher()
    this.fsw.on('change', this.run.bind(this))
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

    // setTimeout(() => {
    //   console.log('WATCH', this.fsw.getWatched())
    // }, 100)

  }

  async start() {
    await this.run(false)
  }

  async run(once: boolean) {
    console.log('\n@voxgig/model', new Date())

    // TODO: build spec should not have src!
    let src = (await readFile(this.spec.path)).toString()
    this.spec.src = src

    let build = new Build(this.spec)
    let br: BuildResult = await build.run()

    console.log('\nFILES:\n' + this.descDeps((br as any).build.root.deps) + '\n')

    if (br.ok) {
      console.log('TOP:', Object.keys(br?.build?.model).join(', '), '\n')

      if (!once) {
        // There may be new files.
        this.update(br)
      }
    }
    else {
      console.log('MODEL ERRORS: ' + br.err?.length)
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
          console.log(be.msg)
        }
        else if (be.message) {
          console.log(be.message)
        }
        else {
          console.log(be)
        }
      }
    }
  }

  descDeps(deps: Record<string, Record<string, { tar: string }>>) {
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
