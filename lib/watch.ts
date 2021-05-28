

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

    // TODO: remove dep map building from Aontu 
    //let depmap = (build.root as any).map

    // console.log('DEPMAP', depmap)

    //let files = Object.keys(depmap.url)
    //console.log('DEP FILES', files)

    let files: string[] =
      Object.keys(build.root.deps).reduce((files: string[], target: any) => {
        files = files.concat(Object.keys(build.root.deps[target]))
        return files
      }, [build.path])


    //console.log('DEPS', build.base, files)

    // TODO: remove deleted files
    files.forEach((file: string) => {
      if ('string' === typeof (file) &&
        '' !== file &&
        build.opts.base !== file
      ) {
        // console.log('ADD', file)
        this.fsw.add(file)
      }
    })

    setTimeout(() => {
      console.log('WATCH', this.fsw.getWatched())
    }, 100)

  }

  async start() {
    await this.run(false)
  }

  async run(once: boolean) {
    // TODO: build spec should not have src!
    let src = (await readFile(this.spec.path)).toString()
    this.spec.src = src

    let build = new Build(this.spec)
    let br = await build.run()

    if (!once) {
      // There may be new files.
      this.update(br)
    }

    this.last = br
    console.log('WATCH RUN DONE', this.spec.path, this.last.ok)

    return br
  }


  async stop() {
    await this.fsw.close()
  }
}


export {
  Watch
}
