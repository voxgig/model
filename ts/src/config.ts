/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */


import Path from 'node:path'

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



// What the Model prepared before the config build: a failure to report, or,
// for a dry run, the config text to serve and the legacy file it comes from.
type ConfigPrep = {
  err?: Error
  text?: () => string
  from?: string
}


class Config {
  build: BuildSpec
  watch: Watch
  log: Log
  prep: ConfigPrep

  constructor(spec: BuildSpec, log: Log, prep: ConfigPrep = {}) {
    this.log = log
    this.prep = prep

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
    if (this.prep.err) {
      return { ok: false, errs: [this.prep.err], runlog: [] }
    }
    const br = await this.watch.run('config', watch, '<config>')
    if (watch && this.prep.from) {
      await this.watch.add(this.prep.from)
    }
    return br
  }

  async start(initial: boolean = true) {
    return this.watch.start(initial)
  }

  async stop() {
    return this.watch.stop()
  }
}


// Creates the config when there is none, migrating a legacy
// model-config.aon forward if one is present. A dry run writes nothing: the
// config text is derived afresh from its source on every read instead.
function prepareConfig(
  fs: any, cbase: string, log: Log, dryrun?: boolean
): ConfigPrep {
  const cpath = cbase + '/' + CONFIG_FILE
  const legacy = cbase + '/' + LEGACY_CONFIG_FILE

  if (fs.existsSync(cpath)) {
    if (fs.existsSync(legacy)) {
      log.warn({
        point: 'config-legacy-ignored', legacy,
        note: 'ignoring ' + legacy + ': ' + cpath + ' takes precedence'
      })
    }
    return {}
  }

  let old: string | undefined
  try {
    old = fs.readFileSync(legacy, 'utf8')
  }
  catch (err: any) {
    if ('ENOENT' !== err?.code) {
      return { err: configError('cannot read ' + legacy, err) }
    }
  }

  if (null != old) {
    log.info({
      point: 'config-migrate', legacy, path: cpath,
      note: 'migrated ' + legacy + ' to ' + cpath +
        (dryrun ? ' (dry run: in memory only)' : '')
    })
  }

  if (dryrun) {
    return null == old ? { text: () => DEFAULT_CONFIG } : {
      text: () => rewriteAonIncludes(fs.readFileSync(legacy, 'utf8')),
      from: legacy,
    }
  }

  try {
    fs.mkdirSync(cbase, { recursive: true })
    writeAtomic(fs, cpath, null == old ? DEFAULT_CONFIG : rewriteAonIncludes(old))
  }
  catch (err: any) {
    return { err: configError('cannot write ' + cpath, err) }
  }

  if (null != old) {
    try { fs.unlinkSync(legacy) } catch (_err: any) { }
  }

  return {}
}


function configError(what: string, cause: any): Error {
  return Object.assign(
    new Error('model config: ' + what + ': ' + (cause?.message || cause)),
    { code: cause?.code, cause })
}


// A reader never sees a partial file: the text lands beside the target and
// is renamed over it.
function writeAtomic(fs: any, path: string, src: string) {
  const tmp = path + '.' + process.pid + '.' +
    Math.random().toString(36).slice(2) + '.tmp'
  try {
    fs.writeFileSync(tmp, src)
    fs.renameSync(tmp, path)
  }
  catch (err: any) {
    try { fs.unlinkSync(tmp) } catch (_err: any) { }
    throw err
  }
}


// A dry run writes nothing, so its config is served from memory, derived on
// each read; its mtime is that of the legacy source, so an edit there
// invalidates the build cache. Matched by resolved path: callers join with
// '/', which a Windows path does not spell the same way.
function readBack(fs: any, path: string, text: () => string, from?: string) {
  const at = Path.resolve(path)
  const mtimeMs = Date.now()
  const mine = (p: any) => Path.resolve(String(p)) === at

  return {
    ...fs,
    readFileSync: (p: any, opts?: any) => {
      if (!mine(p)) {
        return fs.readFileSync(p, opts)
      }
      const enc = 'string' === typeof opts ? opts : opts?.encoding
      const src = text()
      return null == enc ? Buffer.from(src) : src
    },
    statSync: (p: any, ...rest: any[]) => !mine(p) ? fs.statSync(p, ...rest) :
      from ? fs.statSync(from, ...rest) :
        { mtimeMs, isFile: () => true, isDirectory: () => false },
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

export type {
  ConfigPrep,
}



