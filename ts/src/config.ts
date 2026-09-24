/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */


import { memfs as MemFs } from 'memfs'

import type { BuildResult, BuildSpec, Log } from './types'

import { Watch } from './watch'


const CONFIG_FILE = 'model-config.aontu'
const LEGACY_CONFIG_FILE = 'model-config.aon'

const DEFAULT_CONFIG = `
@"@voxgig/model/model/.model-config/model-config.aontu"

sys: model: action: {}
`

const QUOTES = '"\'`'
const SPACE = ' \t\r\n'



class Config {
  build: BuildSpec
  watch: Watch
  log: Log

  constructor(spec: BuildSpec, log: Log) {
    this.log = log

    this.build = {
      path: spec.path,
      base: spec.base,
      res: [
        ...(spec.res || [])
      ],
      require: spec.require,
      log: this.log,
      fs: spec.fs
    }

    this.watch = new Watch(this.build, this.log)
  }

  async run(watch: boolean): Promise<BuildResult> {
    return this.watch.run('config', watch, '<config>')
  }

  async start(initial: boolean = true) {
    return this.watch.start(initial)
  }

  async stop() {
    return this.watch.stop()
  }
}


// Creates the config when there is none, migrating a legacy
// model-config.aon forward if one is present. Returns the source written,
// or undefined when the config already exists.
function prepareConfig(
  fs: any, cbase: string, log: Log, dryrun?: boolean
): string | undefined {
  const cpath = cbase + '/' + CONFIG_FILE
  const legacy = cbase + '/' + LEGACY_CONFIG_FILE

  if (fs.existsSync(cpath)) {
    if (fs.existsSync(legacy)) {
      log.warn({
        point: 'config-legacy-ignored', legacy,
        note: 'ignoring ' + legacy + ': ' + cpath + ' takes precedence'
      })
    }
    return undefined
  }

  let old: string | undefined
  try { old = fs.readFileSync(legacy, 'utf8') } catch (_err: any) { }
  const src = null == old ? DEFAULT_CONFIG : rewriteAonIncludes(old)

  fs.mkdirSync(cbase, { recursive: true })
  fs.writeFileSync(cpath, src)

  if (null != old) {
    log.info({
      point: 'config-migrate', legacy, path: cpath,
      note: 'migrated ' + legacy + ' to ' + cpath +
        (dryrun ? ' (dry run: in memory only)' : '')
    })
    // A dry run's unlink targets its in-memory volume, which lacks the file.
    try { fs.unlinkSync(legacy) } catch (_err: any) { }
  }

  return src
}


// A dry run writes to memory but reads from disk, so the config it just
// wrote is served back from memory.
function readBack(fs: any, path: string, src: string) {
  const { fs: mem } = MemFs({ [path]: src })
  const from = (p: any) => p === path ? mem : fs
  return {
    ...fs,
    readFileSync: (p: any, ...rest: any[]) => from(p).readFileSync(p, ...rest),
    statSync: (p: any, ...rest: any[]) => from(p).statSync(p, ...rest),
  }
}


// Points each include of a .aon file at its .aontu successor. Strings and
// comments are skipped, so a path held as data or commented out is kept.
function rewriteAonIncludes(src: string): string {
  let out = ''
  let i = 0

  while (i < src.length) {
    const c = src[i]
    let end = i + 1
    let retarget = false

    if ('#' === c) {
      end = src.indexOf('\n', i)
      end = -1 === end ? src.length : end
    }
    else if (QUOTES.includes(c)) {
      end = stringEnd(src, i).end
    }
    else if ('@' === c) {
      let q = end
      while (q < src.length && SPACE.includes(src[q])) {
        q++
      }
      if (q < src.length && QUOTES.includes(src[q])) {
        const str = stringEnd(src, q)
        end = str.end
        retarget = str.closed && src.slice(q + 1, end - 1).endsWith('.aon')
      }
    }

    out += retarget ?
      src.slice(i, end - 1) + 'tu' + src[end - 1] : src.slice(i, end)
    i = end
  }

  return out
}


// A string ends at its unescaped closing quote, or, unterminated, at its
// line; a backtick string may span lines.
function stringEnd(src: string, start: number): { end: number, closed: boolean } {
  const quote = src[start]
  let i = start + 1
  while (i < src.length) {
    const c = src[i]
    if ('\\' === c) {
      i += 2
    }
    else if (quote === c) {
      return { end: i + 1, closed: true }
    }
    else if ('\n' === c && '`' !== quote) {
      return { end: i, closed: false }
    }
    else {
      i++
    }
  }
  return { end: src.length, closed: false }
}


export {
  Config,
  BuildSpec,
  CONFIG_FILE,
  LEGACY_CONFIG_FILE,
  prepareConfig,
  readBack,
  rewriteAonIncludes,
}



