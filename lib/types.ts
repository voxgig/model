


interface Build {
  id: string
  src: string
  base: string
  path: string
  root: any
  opts: { [key: string]: any }
  res: BuildAction[]
  spec: Spec
  model: any
  use: { [name: string]: any }
  err: any[]
  ctx: BuildContext

  run: () => Promise<BuildResult>
}


interface BuildResult {
  ok: boolean
  builder?: string
  path?: string
  build?: Build
  builders?: BuildResult[]
  step?: string
  err?: any[]
}

interface BuildAction {
  path: string
  build: Builder
}


interface BuildContext {
  step: 'pre' | 'post'
  state: Record<string, any>
}

type Builder = (
  build: Build,
  ctx: BuildContext,
) => Promise<BuildResult>


interface Spec {
  src: string
  path?: string
  base?: string
  res?: BuildAction[]
  require?: any
  use?: { [name: string]: any }
}



export type {
  Build,
  BuildResult,
  BuildAction,
  Builder,
  BuildContext,
  Spec,
}
