/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */

import Fs from 'node:fs'

import Pino from 'pino'


type FST = typeof Fs

type Log = ReturnType<typeof Pino>

interface Build {
  id: string
  base: string
  path: string
  root: any
  opts: { [key: string]: any }
  pdef: ProducerDef[]
  spec: BuildSpec
  model: any
  use: { [name: string]: any }
  errs: any[]
  ctx: BuildContext

  run: (rspec: RunSpec) => Promise<BuildResult>
  log: Log
  fs: FST
  dryrun: boolean
  args: any
}


interface BuildResult {
  ok: boolean
  builder?: string
  path?: string
  producers?: ProducerResult[]
  step?: string
  errs: any[]
  runlog: string[]
  build?: () => Build
}


interface BuildContext {
  step: 'pre' | 'post'
  watch: boolean,
  state: Record<string, any>
}


interface BuildSpec {
  path?: string
  base?: string
  res?: ProducerDef[]
  require?: any
  use?: { [name: string]: any }
  log?: Log
  idle?: number
  name?: string
  debug?: boolean | string
  dryrun?: boolean,
  buildargs?: any,
  watch?: {
    mod?: boolean // file modification
    add?: boolean // file addition
    rem?: boolean // file deletion
  }
  fs: FST
}


interface ProducerDef {
  path: string
  build: Producer
}

type Producer = (
  build: Build,
  ctx: BuildContext,
) => Promise<ProducerResult>


interface ProducerResult {
  ok: boolean
  name: string
  active: boolean
  errs: any[]
  runlog: string[]
  step: string
  reload: boolean
}


type Run = {
  canon: string
  path: string
  start: number
  end: number
  result?: BuildResult
}


type RunSpec = {
  watch: boolean
}

type Canon = {
  path: string
  isFolder: boolean
  when: number
}


type ChangeItem = {
  path: string
  when: number
}

interface ModelSpec {
  path?: string
  base?: string
  require?: any
  log?: Log
  idle?: number
  debug?: boolean | string
  dryrun?: boolean
  buildargs?: any
  fs?: any
  watch?: {
    mod?: boolean // file modification
    add?: boolean // file addition
    rem?: boolean // file deletion
  }
}



export type {
  Build,
  BuildResult,
  ProducerDef,
  Producer,
  ProducerResult,
  BuildContext,
  BuildSpec,
  Log,
  Run,
  Canon,
  ChangeItem,
  RunSpec,
  ModelSpec,
  FST,
}
