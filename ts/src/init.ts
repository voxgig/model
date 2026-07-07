/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */

import Path from 'node:path'


const STARTER_MODEL = `# Voxgig model. Edit this file, then build it:
#   voxgig-model model/model.aontu
#
# Models are unified .aontu - add types, defaults, references, imports.
# Tutorial: https://github.com/voxgig/model/blob/main/docs/tutorial.md

name: 'my-model'
`

const STARTER_CONFIG = `# Model configuration. Declare build actions and their order here.
#
# Example (TypeScript loads the module; Go binds the name to a
# registered action func):
#   sys: model: action: { example: load: 'build/example' }
#   sys: model: order: action: 'example'

sys: model: action: {}
sys: model: order: action: *''
`


type InitResult = {
  created: string[]
  skipped: string[]
}


// Scaffold a starter model and config under <dir>/model. Existing files are
// left untouched.
function initModel(dir: string, fs: any): InitResult {
  const d = dir || '.'
  const files: [string, string][] = [
    [Path.join(d, 'model', 'model.aontu'), STARTER_MODEL],
    [Path.join(d, 'model', '.model-config', 'model-config.aontu'), STARTER_CONFIG],
  ]

  const created: string[] = []
  const skipped: string[] = []

  for (const [p, content] of files) {
    if (fs.existsSync(p)) {
      skipped.push(p)
      continue
    }
    fs.mkdirSync(Path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
    created.push(p)
  }

  return { created, skipped }
}


export {
  initModel,
}

export type {
  InitResult,
}
