# How-to guides

Focused recipes for specific tasks. Each is self-contained. If you are new to
the tool, do the [tutorial](./tutorial.md) first; for exhaustive detail see the
[reference](./reference.md).

- [Initialize a new model](#initialize-a-new-model)
- [Build once vs. watch](#build-once-vs-watch)
- [Pass build arguments to actions](#pass-build-arguments-to-actions)
- [Write a build action](#write-a-build-action)
- [Order and select actions](#order-and-select-actions)
- [Regenerate model source, then rebuild (pre + reload)](#regenerate-model-source-then-rebuild-pre--reload)
- [Split a model across files and packages](#split-a-model-across-files-and-packages)
- [Define and reuse a shape](#define-and-reuse-a-shape)
- [Embed the model in your own program](#embed-the-model-in-your-own-program)
- [Run a custom producer pipeline](#run-a-custom-producer-pipeline)
- [Preview without writing files (dry run)](#preview-without-writing-files-dry-run)
- [Build against an in-memory filesystem](#build-against-an-in-memory-filesystem)
- [Control logging](#control-logging)
- [Handle and surface build errors](#handle-and-surface-build-errors)
- [Tune watch behavior](#tune-watch-behavior)


## Initialize a new model

Scaffold a starter `model/model.jsonic` and `model/.model-config/model-config.jsonic`:

```bash
voxgig-model init            # in the current directory
voxgig-model init my-project # under my-project/
```

Existing files are left untouched. Then build it:

```bash
voxgig-model model/model.jsonic
```

The Go CLI is identical (`go run github.com/voxgig/model/go/cmd/voxgig-model init`).
From code, use `initModel(dir, fs)` (TypeScript) or `model.Init(dir)` (Go):

```js
const Fs = require('node:fs')
const { initModel } = require('@voxgig/model')
const { created, skipped } = initModel('.', Fs)
```


## Build once vs. watch

Once, then exit:

```bash
voxgig-model model/model.jsonic
```

```js
const { Model } = require('@voxgig/model')
const model = new Model({ path: 'model/model.jsonic', base: 'model' })
const result = await model.run()
if (!result.ok) process.exitCode = 1
```

Watch and rebuild until stopped:

```bash
voxgig-model --watch model/model.jsonic
```

```js
const model = new Model({ path: 'model/model.jsonic', base: 'model' })
await model.start()
// ... later, to release the watchers:
await model.stop()
```

> `start()` returns once watching has begun; the first build is enqueued
> asynchronously. Always `stop()` when done — otherwise the file watchers keep
> the process alive.


## Pass build arguments to actions

Build arguments are arbitrary data exposed to every action as `build.args`.

```bash
voxgig-model -b '{env:prod, region:eu-west-1}' model/model.jsonic
```

```js
new Model({ path: 'model/model.jsonic', base: 'model',
            buildargs: { env: 'prod', region: 'eu-west-1' } })
```

```js
// build/deploy.js
module.exports = async function deploy(model, build) {
  const env = build.args?.env ?? 'dev'
  build.log.info({ point: 'deploy', note: 'env=' + env })
  return { ok: true }
}
```


## Write a build action

1. Declare it in `model/.model-config/model-config.jsonic`:

   ```jsonic
   sys: model: action: {
     genDocs: load: 'build/genDocs'
   }
   ```

   `load` is relative to the **project root** (the directory above `model/`),
   without a file extension. Action names are plain identifiers — use `genDocs`,
   not `gen-docs` (a hyphenated name would need quoting: `'gen-docs'`).

2. Implement `build/genDocs.js`:

   ```js
   const Path = require('node:path')

   module.exports = async function genDocs(model, build, ctx) {
     const root = Path.resolve(build.path, '..', '..')
     build.fs.mkdirSync(Path.resolve(root, 'out'), { recursive: true })
     build.fs.writeFileSync(
       Path.resolve(root, 'out', 'model.html'),
       '<pre>' + JSON.stringify(model, null, 2) + '</pre>'
     )
     return { ok: true }
   }
   ```

Use `build.fs` (not `require('fs')`) so the action honors `--dryrun`. Use
`build.log` for logging so output is consistent and respects the log level.


## Order and select actions

Declare several actions and set an explicit order:

```jsonic
sys: model: action: {
  genTypes: load: 'build/genTypes'
  genDocs:  load: 'build/genDocs'
  lint:     load: 'build/lint'
}

# comma-separated; runs in this order
sys: model: order: action: 'genTypes,genDocs,lint'
```

Omit `order.action` to run every declared action in declaration order. Naming an
action in `order.action` that has no definition fails the build with a clear
error.

Control **when** an action runs with its `step` export:

```js
module.exports = async function genTypes(model, build) { /* ... */ }
module.exports.step = 'post'   // 'pre' | 'post' | 'all'; default 'post'
```


## Regenerate model source, then rebuild (pre + reload)

Sometimes an action must generate `.jsonic` that the model itself consumes. Run
it in the `pre` phase and request a reload:

```js
// build/genSource.js  (declared as `genSource: load: 'build/genSource'`)
const Path = require('node:path')

module.exports = async function genSource(model, build) {
  const root = Path.resolve(build.path, '..', '..')
  // write a .jsonic file the root model imports
  build.fs.writeFileSync(
    Path.resolve(root, 'model', 'generated.jsonic'),
    'generated: ok: true\n'
  )
  return { ok: true, reload: true }   // re-resolve before the post phase
}

module.exports.step = 'pre'
```

With `reload: true`, the model is re-resolved after the `pre` phase, so `post`
actions and `model_producer` see the regenerated source.


## Split a model across files and packages

Import another file relative to the current one:

```jsonic
@"./shapes.jsonic"
color: @"./palette.jsonic"
```

Import from an installed package by its module path:

```jsonic
@"@voxgig/model/model/.model-config/model-config.jsonic"
```

All imports are tracked as dependencies — editing an imported file rebuilds the
model in watch mode.


## Define and reuse a shape

A "shape" is a reusable structure of defaults and constraints. Define it once,
then unify it into each instance:

```jsonic
shape: endpoint: {
  method: *'GET' | string
  auth:   *true  | boolean
  path?:  string              # optional in the shape; each endpoint sets it
}

api: list:   $.shape.endpoint & { path: '/items' }
api: create: $.shape.endpoint & { path: '/items', method: 'POST' }
```

Apply a shape to **every** entry of a map with the `&:` wildcard:

```jsonic
api: &: $.shape.endpoint     # every child of `api` must satisfy endpoint
api: list:   { path: '/items' }
api: create: { path: '/items', method: 'POST' }
```


## Embed the model in your own program

`Model` is a normal class — drive it from your own tooling:

```js
const { Model } = require('@voxgig/model')

async function buildModel() {
  const model = new Model({
    path: __dirname + '/model/model.jsonic',
    base: __dirname + '/model',
    require: __dirname,            // project root for action resolution
    buildargs: { env: process.env.NODE_ENV ?? 'dev' },
    debug: 'warn',                 // quieter logging
  })

  const result = await model.run()
  if (!result.ok) {
    throw new Error('model build failed: ' +
      result.errs.map(e => e.message ?? e).join('; '))
  }
  // the unified model:
  return result.build?.().model
}
```


## Run a custom producer pipeline

Skip the config/action layer entirely and assemble producers yourself with
`makeBuild`. A **producer** runs in both the `pre` and `post` phases and returns
a `ProducerResult`.

```js
const Fs = require('node:fs')
const { makeBuild } = require('@voxgig/model/dist/build')
const { model_producer } = require('@voxgig/model/dist/producer/model')
const { prettyPino } = require('@voxgig/util')

const build = makeBuild({
  fs: Fs,
  base: __dirname + '/model',
  path: __dirname + '/model/model.jsonic',
  res: [
    { path: '/', build: model_producer },          // write model.json
    { path: '/', build: async function summary(build, ctx) {
        if (ctx.step === 'post') {
          const n = Object.keys(build.model).length
          build.log.info({ point: 'summary', note: n + ' top-level keys' })
        }
        return { ok: true, name: 'summary', step: ctx.step,
                 active: true, reload: false, errs: [], runlog: [] }
      }
    },
  ],
}, prettyPino('custom', {}))

const result = await build.run({ watch: false })
```


## Preview without writing files (dry run)

```bash
voxgig-model --dryrun model/model.jsonic
```

```js
new Model({ path: 'model/model.jsonic', base: 'model', dryrun: true })
```

The build runs fully — the model resolves and actions execute — but every write
(sync or promise-based) is redirected to an in-memory filesystem. Nothing on
disk changes. This is the safe way to test a model or a new action.


## Build against an in-memory filesystem

Provide your own `fs` implementation (for example
[`memfs`](https://github.com/streamich/memfs)) to build entirely in memory —
useful for tests or sandboxed generation:

```js
const { memfs } = require('memfs')
const { Model } = require('@voxgig/model')

// Seed the in-memory volume. Include a config file: a pure in-memory build
// cannot resolve the package import that an auto-created config would use.
const { fs, vol } = memfs({
  '/proj/model/model.jsonic': 'service: name: orders\n',
  '/proj/model/.model-config/model-config.jsonic': 'sys: model: action: {}\n',
})

const model = new Model({
  path: '/proj/model/model.jsonic',
  base: '/proj/model',
  fs,
})
await model.run()

console.log(vol.toJSON())   // includes the generated /proj/model/model.json
```

The provided `fs` must support the synchronous methods the build uses
(`readFileSync`, `writeFileSync`, `mkdirSync`, `statSync`, `existsSync`).


## Control logging

Set the level with `--debug`/`debug`:

```bash
voxgig-model -g debug model/model.jsonic     # verbose
voxgig-model -g warn  model/model.jsonic     # quieter
voxgig-model -g silent model/model.jsonic    # no logs
```

```js
new Model({ path, base, debug: 'silent' })   // string level
new Model({ path, base, debug: true })       // shorthand for 'debug'
```

Levels: `trace`, `debug`, `info` (default), `warn`, `error`, `fatal`, `silent`.
In your actions and producers, log through `build.log` so output stays
consistent:

```js
build.log.info({ point: 'my-action', note: 'did the thing' })
```


## Handle and surface build errors

`run()` resolves with a `BuildResult`; check `ok` and inspect `errs`:

```js
const result = await model.run()
if (!result.ok) {
  for (const err of result.errs) {
    console.error(err.message ?? err)
  }
  process.exitCode = 1
}
```

Errors are reset at the start of each build, so a result reflects only that
build. Model (unification) errors, missing files, unknown actions, and actions
that throw all surface through `result.errs` with `result.ok === false`.


## Tune watch behavior

Choose which filesystem events trigger a rebuild and adjust the debounce:

```js
new Model({
  path, base,
  idle: 250,            // debounce window in ms (default 111)
  watch: {
    mod: true,          // rebuild on file modification (default true)
    add: true,          // rebuild on file addition    (default false)
    rem: true,          // rebuild on file deletion     (default false)
  },
})
```

The CLI enables `mod`, `add`, and `rem` by default in watch mode. A larger
`idle` coalesces bursts of changes (e.g. an external tool writing many files)
into a single rebuild.
