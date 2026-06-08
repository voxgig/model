# Reference

Complete technical reference for `@voxgig/model`. For a guided introduction
start with the [tutorial](./tutorial.md); for goal-oriented recipes see the
[how-to guides](./how-to.md); for the ideas behind the design read the
[explanation](./explanation.md).

- [Command line interface](#command-line-interface)
- [Project layout](#project-layout)
- [The config file](#the-config-file)
- [Actions](#actions)
- [Build arguments](#build-arguments)
- [Programmatic API](#programmatic-api)
- [Producers](#producers)
- [The build lifecycle](#the-build-lifecycle)
- [Modeling language essentials](#modeling-language-essentials)
- [Logging](#logging)
- [npm scripts](#npm-scripts)
- [Troubleshooting](#troubleshooting)
- [Requirements](#requirements)


## Command line interface

```
voxgig-model <root-file> [options]
```

`<root-file>` is the root `.jsonic` file of the model. It is also accepted as
`--model <file>`. The directory containing the root file is the model **base**;
generated model JSON is written next to the root file.

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--model <file>` | `-m` | string | first positional | Root model file path. |
| `--watch` | `-w` | boolean | `false` | Watch source and config files; rebuild on change. Runs until interrupted. |
| `--debug <level>` | `-g` | string | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`. |
| `--dryrun` | `-y` | boolean | `false` | Resolve and run the build, but redirect all file writes to an in-memory filesystem (nothing touches disk). |
| `--build <jsonic>` | `-b` | string | `''` | A [jsonic](https://github.com/jsonic-lang/jsonic) document of build arguments, exposed to actions as `build.args`. |
| `--help` | `-h` | boolean | | Print usage and exit. |
| `--version` | `-v` | boolean | | Print version and exit. |

The model path is resolved relative to the current working directory. The
current working directory is also recorded as the project `require` base used
to resolve action modules.

**Exit codes:** `0` on success or after `--help`/`--version`; `1` on a usage
error, a missing model file, or an uncaught build error.

```bash
# Build once, writing model/model.json
voxgig-model model/model.jsonic

# Watch and rebuild, with debug logging
voxgig-model -w -g debug model/model.jsonic

# Dry run (no files written)
voxgig-model --dryrun model/model.jsonic

# Pass build arguments to actions
voxgig-model -b '{env:prod, region:eu-west-1}' model/model.jsonic
```


## Project layout

A model is a directory tree. The conventional shape:

```
my-project/
├─ model/
│  ├─ model.jsonic                  # root model file (your entry point)
│  ├─ ...more .jsonic files         # imported by the root
│  ├─ model.json                    # GENERATED: the unified model
│  └─ .model-config/
│     ├─ model-config.jsonic        # config: declares actions
│     └─ model-config.json          # GENERATED: the unified config
└─ build/
   ├─ foo.js                        # an action module
   └─ bar.js
```

Two paths are derived from the root file `model/model.jsonic`:

- **base** = `model/` — the directory of the root file. Generated model JSON
  (`model.json`) and the `.model-config/` directory live here.
- **project root** = `my-project/` — the directory **two levels above** the
  root file (`resolve(rootFile, '..', '..')`). Action `load` paths are
  resolved against the project root, so `build/foo` means
  `my-project/build/foo.js`.

This two-levels-up rule means the root model file is expected to sit one
directory below the project root (e.g. `model/model.jsonic`).


## The config file

`<base>/.model-config/model-config.jsonic` declares the **actions** that run
during a build. If it does not exist, the `Model` constructor creates a minimal
one that imports the package's base config.

The config is itself a model, unified the same way as your main model. The
keys the tool reads:

```jsonic
# Each action has a load path (relative to the project root, no extension).
# Action names are jsonic identifiers (no hyphens unless quoted).
sys: model: action: {
  genDocs:  load: 'build/genDocs'
  genTypes: load: 'build/genTypes'
}

# Optional explicit run order (comma-separated action names).
# When omitted, every declared action runs in declaration order.
sys: model: order: action: 'genTypes,genDocs'
```

| Config key | Type | Meaning |
|------------|------|---------|
| `sys.model.action.<name>.load` | string | Module path for the action, relative to the project root, without file extension. **Required** for each action. |
| `sys.model.order.action` | string | Comma-separated action names defining run order. Names are split on commas and surrounding whitespace; empty entries are ignored. If absent, the order is the key order of `sys.model.action`. |

> Backwards compatibility: if `sys.model.action` is absent, `sys.model.builders`
> is read instead.

An `order.action` entry that names an action with no matching `action.<name>`
fails the build with `Unknown model action "<name>"`. An action whose
definition has no `load` fails with `Model action "<name>" is missing a "load"
path`.

The generated `model-config.json` is written next to `model-config.jsonic`.


## Actions

An action is a CommonJS module that receives the unified model and produces
side effects — typically generating source files, documentation, infrastructure
config, or other artifacts.

### Module signature

```js
// build/genDocs.js
module.exports = async function genDocs(model, build, ctx) {
  // model — the unified model object (plain data)
  // build — the Build instance (see API reference)
  // ctx   — the BuildContext: { step, watch, state }

  build.fs.writeFileSync('out/docs.html', render(model))

  return { ok: true, reload: false }
}

// Optional: when does this action run? 'pre' | 'post' | 'all'. Default 'post'.
module.exports.step = 'post'
```

The module's default export may also be a `Promise` that resolves to the
function (it is awaited once at load time).

### Arguments

| Argument | Description |
|----------|-------------|
| `model` | The unified model as plain JSON-compatible data. Same value as `build.model`. |
| `build` | The [`Build`](#build) instance. Useful members: `build.fs` (honors `--dryrun`), `build.args` (build arguments), `build.path`, `build.opts.base`, `build.log`, `build.dryrun`. |
| `ctx` | The [`BuildContext`](#buildcontext). `ctx.step` is `'pre'` or `'post'`; `ctx.state` is a per-build scratch object shared across producers. |

### Return value

Return `{ ok, reload }`, or nothing:

| Field | Type | Meaning |
|-------|------|---------|
| `ok` | boolean | `false` fails the build and stops remaining actions. A missing/`null` return is treated as success. |
| `reload` | boolean | When `true` (typically from a `pre` action that rewrote model source files), the model is re-resolved before `post` actions run. |

A thrown error fails the build; the error is logged once and surfaced in
`BuildResult.errs`.

### Steps

| Step | Runs | Use for |
|------|------|---------|
| `pre` | before the model is finalized | Generating or rewriting `.jsonic` source that the model itself depends on; pair with `reload: true`. |
| `post` (default) | after the model is finalized | Emitting artifacts from the finished model. |
| `all` | both phases | Actions that must observe both phases. |

### Example: a `pre` action that feeds back into the model

```js
// build/pre.js — writes a source file the model imports, then asks for a reload
const Path = require('node:path')
const Fs = require('node:fs')

module.exports = async function pre(model, build) {
  const root = Path.resolve(build.path, '..', '..')
  if (!build.dryrun) {
    Fs.writeFileSync(Path.resolve(root, 'model', 'pre.jsonic'), 'OK')
  }
  return { ok: true, reload: true }
}

module.exports.step = 'pre'
```


## Build arguments

Build arguments are arbitrary data passed into a build and exposed to actions as
`build.args`.

- **CLI:** `-b '<jsonic>'` — parsed with jsonic. e.g. `-b '{env:prod}'`.
- **API:** `new Model({ ..., buildargs: { env: 'prod' } })`.

```js
module.exports = async function deploy(model, build) {
  const env = build.args?.env ?? 'dev'
  // ...
}
```


## Programmatic API

The package main export provides `Model` and the `BuildSpec` type:

```js
const { Model } = require('@voxgig/model')
// or: import { Model } from '@voxgig/model'
```

Lower-level building blocks are available from subpaths (no `exports` map is
defined, so deep imports resolve directly to files):

```js
const { makeBuild } = require('@voxgig/model/dist/build')
const { model_producer } = require('@voxgig/model/dist/producer/model')
const { local_producer } = require('@voxgig/model/dist/producer/local')
```

### Model

```ts
class Model {
  constructor(mspec: ModelSpec)
  run(): Promise<BuildResult>            // build once
  start(): Promise<void | BuildResult>   // build once, then watch and rebuild
  stop(): Promise<void>                  // stop all watchers
  fs: any                                // the (possibly dryrun) fs in use
  log: Log                               // the pino logger
}
```

- `run()` performs a single build (config then model) and resolves with the
  model `BuildResult`. If the config build fails, its result is returned
  instead.
- `start()` performs the initial build, then watches both the model files and
  the config files, rebuilding on change. It resolves once watching has begun
  (the initial build is enqueued asynchronously). On a failed initial config
  build it resolves with that result. **Always call `stop()`** to release
  watchers, or the process stays alive.
- `stop()` clears the watch interval and closes the file watchers for both the
  model and config.

### ModelSpec

```ts
interface ModelSpec {
  path?: string        // root model file path
  base?: string        // model base directory (defaults from path)
  require?: any        // project root used to resolve action modules
  buildargs?: any      // build arguments, exposed as build.args
  debug?: boolean | string  // log level (string) or true => 'debug'
  dryrun?: boolean     // redirect writes to an in-memory fs
  idle?: number        // watch debounce in ms (default 111)
  fs?: any             // a custom fs implementation (e.g. memfs)
  log?: Log            // a pre-built pino logger
  watch?: {            // which filesystem events trigger rebuilds
    mod?: boolean      //   modifications (default true)
    add?: boolean      //   additions     (default false)
    rem?: boolean      //   deletions     (default false)
  }
}
```

### BuildResult

```ts
interface BuildResult {
  ok: boolean                  // did the build succeed?
  errs: any[]                  // errors collected this build
  runlog: string[]             // ordered log of build phases
  producers?: ProducerResult[] // per-producer results
  build?: () => Build          // accessor for the underlying Build
  builder?: string
  path?: string
  step?: string
}
```

`errs` is reset at the start of every build, so a `BuildResult` reflects only
that build (a `Build` reused across watch rebuilds does not accumulate stale
errors).

### makeBuild and BuildSpec

`makeBuild(spec, log)` constructs a single `Build` you can drive directly,
bypassing `Model`'s config/watch machinery. Useful for embedding a custom
producer pipeline.

```ts
function makeBuild(spec: BuildSpec, log: Log): Build

interface BuildSpec {
  path?: string                 // root model file
  base?: string                 // base dir (enables model JSON output)
  res?: ProducerDef[]           // the producer pipeline
  fs: FST                       // filesystem (required)
  use?: { [name: string]: any } // shared services made available on build.use
  require?: any                 // project root for action resolution
  buildargs?: any               // build.args
  debug?: boolean | string
  dryrun?: boolean
  idle?: number                 // watch debounce (ms)
  name?: string                 // build name (default 'model')
  watch?: { mod?: boolean; add?: boolean; rem?: boolean }
  log?: Log
}
```

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
    { path: '/', build: model_producer },
    { path: '/', build: async (build, ctx) => {
        if (ctx.step === 'post') console.log('model:', build.model)
        return { ok: true, name: 'inspect', step: ctx.step,
                 active: true, reload: false, errs: [], runlog: [] }
      }
    },
  ],
}, prettyPino('demo', {}))

const result = await build.run({ watch: false })
```

### Build

The `Build` instance passed to producers and actions.

```ts
interface Build {
  id: string                 // random build id
  path: string               // root model file
  base: string               // base directory
  model: any                 // the unified model (after resolveModel)
  opts: { [key: string]: any }  // aontu options; opts.base is the output base
  fs: FST                    // filesystem (honors dryrun)
  args: any                  // build arguments
  dryrun: boolean
  log: Log
  use: { [name: string]: any }  // shared services (e.g. use.config)
  deps: any                  // import dependency graph recorded by aontu
  errs: any[]
  ctx: BuildContext
  aontu: Aontu               // the unification engine instance
  run: (rspec: RunSpec) => Promise<BuildResult>
  spec: BuildSpec
  pdef: ProducerDef[]
}
```

### BuildContext

```ts
interface BuildContext {
  step: 'pre' | 'post'        // current build phase
  watch: boolean              // is this a watch-mode build?
  state: Record<string, any>  // scratch shared across producers in one build
}
```

### Producer and ProducerResult

```ts
type Producer = (build: Build, ctx: BuildContext) => Promise<ProducerResult>

interface ProducerDef { path: string; build: Producer }

interface ProducerResult {
  ok: boolean
  name: string
  step: string
  active: boolean
  reload: boolean    // request a model re-resolve before the post phase
  errs: any[]
  runlog: string[]
}
```


## Producers

A **producer** is a function run by a build during both the `pre` and `post`
phases. Producers are the extension point; **actions** are a convenience layer
built on top of the `local_producer`.

The default `Model` pipeline is, in order:

1. `model_producer` — serializes and writes the unified model.
2. `local_producer` — loads and runs project actions.

### model_producer

- **Runs:** `post` phase only.
- **Effect:** writes `build.model` as pretty JSON to
  `<opts.base>/<root-file-name>.json` (the root file's basename with its
  extension replaced by `.json`).
- **Idempotent:** if the target file already contains identical JSON, the write
  is skipped to avoid mtime churn that would invalidate caches and re-trigger
  watchers.

### local_producer

- **Runs:** both phases. On first call it loads the action modules declared in
  the config (resolving each `load` against the project root) and caches them in
  `ctx.state.local`.
- **Effect:** runs the actions whose `step` matches the current phase (`pre`
  actions in `pre`, `post` actions in `post`, `all` actions in both), in the
  configured order. Propagates each action's `ok` and `reload`.

### Custom producers

Provide your own pipeline via `makeBuild({ res: [...] })`, or compose with the
built-ins. A producer should return a `ProducerResult`; set `reload: true` to
request the model be re-resolved before the post phase.


## The build lifecycle

A single build (`Build.run`) proceeds as:

1. **Reset** — clear per-build error state.
2. **resolveModel** — read the root file and unify it (and its imports) with
   `aontu`, producing `build.model`. Results are cached by file modification
   time; an unchanged model is reused.
3. **pre phase** — run every producer with `ctx.step = 'pre'`. Collect `reload`
   flags. Stop on the first failure.
4. **reload** — if any `pre` producer requested a reload (and there were no
   errors), run `resolveModel` again to pick up regenerated source.
5. **post phase** — run every producer with `ctx.step = 'post'`.
6. **result** — return a `BuildResult` with `ok`, `producers`, `errs`, `runlog`.

A `Model` orchestrates **two** builds:

- The **config build** resolves `.model-config/model-config.jsonic` (writing
  `model-config.json`) and, via an internal trigger producer, drives the main
  model build.
- The **model build** resolves your root model (writing `model.json`) and runs
  your actions.

In watch mode both the model's source files and the config's source files are
watched; a change to either rebuilds the model.

See [explanation](./explanation.md) for the reasoning and the caching and watch
designs in depth.


## Modeling language essentials

Models are written in **[jsonic](https://github.com/jsonic-lang/jsonic)**
(a relaxed JSON superset) and unified with **[aontu](https://github.com/voxgig/aontu)**,
which implements [CUE](https://cuelang.org)-style unification. This is a
practical summary; consult the CUE and aontu docs for the full language.

### jsonic basics

```jsonic
# Comments start with #
foo: 1                  # quotes are optional for keys and simple strings
bar: 'a string'
list: [1, 2, 3]
a: b: c: 1              # dotted/nested keys: same as a:{b:{c:1}}
obj: {
  x: 10
  y: 20                 # commas between entries are optional
}
```

The top level is an implicit object; you do not wrap the file in `{ }`.

> **Key syntax.** Bareword keys are identifiers — letters, digits, and
> underscores (`envFile`, `gen_docs`, `srv2`). Quote any key containing a
> hyphen, dot, space, or other punctuation: `'env-file': …`. An unquoted
> `env-file:` is a syntax error.

### Unification and types

| Construct | Meaning |
|-----------|---------|
| `string` `number` `integer` `boolean` | Type constraints (a value must be of that type). |
| `x: number` then `x: 2` | Unify the constraint with the value → `2`. Conflicting concrete values (`x: 1` and `x: 2`) fail to unify. |
| `A & B` | Unify two structures/values into one. |
| `*V \| T` | A **default**: value `V` if nothing more specific is provided, otherwise constrained to type `T`. e.g. `active: *true \| boolean`. |
| `field?: T` | An **optional** field (no error if absent). |
| `type({})` | Declare a struct type. |

> **Every emitted field must be concrete.** The generated model is plain data,
> so each field that survives into it must resolve to a value: a literal, a
> default (`*v | T`), or an optional field (`f?: T`) that is simply absent. A
> bare type constraint such as `name: string`, left with nothing to satisfy it,
> fails to generate. Give reusable shapes defaults or optional fields and let
> concrete instances supply the rest. (Constraints applied through a `&:`
> wildcard are fine — they are not emitted directly; the children that satisfy
> them are.)

### References

| Reference | Meaning |
|-----------|---------|
| `$.a.b.c` | **Absolute** reference from the model root. |
| `.a.b` | **Relative** reference. |

```jsonic
sys: shape: srv: std: { api: web: active: *true | boolean }

# Reuse a shape by unifying with an absolute reference:
main: srv: foo: $.sys.shape.srv.std & { api: web: method: 'GET' }
```

### Wildcards and `key()`

`&:` defines a constraint applied to **every** child of a map. `key()` resolves
to the current map key.

```jsonic
color: &: {
  name: key()        # each entry's name becomes its key
  value: string
}
color: red:  { value: 'f00' }
color: blue: { value: '00f' }
# => color.red.name == 'red', color.blue.name == 'blue'
```

### Imports

Pull in another file with `@"..."`:

```jsonic
# relative to the importing file
color: @"./color.jsonic"

# a path inside an installed package
@"@voxgig/model/model/.model-config/model-config.jsonic"
```

Imported files are tracked as dependencies, so changing one triggers a rebuild
in watch mode.


## Logging

Logging uses [pino](https://github.com/pinojs/pino) via
`@voxgig/util`'s `prettyPino`. The level comes from `debug`
(`ModelSpec.debug` / `--debug`):

- absent → `info`
- `true` → `debug`
- a string → used as the level verbatim (`trace`…`fatal`, or `silent`)

Each log line carries a `point` (a short event name such as `build-start`,
`write-model`, `pre-actions`, `build-end`) and a human-readable `note`. Paths in
notes are shown relative to the current working directory.


## npm scripts

For working **on** the TypeScript package — run these from the `ts/` directory
(see [AGENTS.md](../AGENTS.md) for the full contributor/agent guide, including
the Go module and the root `Makefile` that builds and tests both):

| Script | What it does |
|--------|--------------|
| `npm run build` | Compile `src` → `dist` and `test` → `dist-test` (`tsc --build src test`). |
| `npm test` | Run the compiled tests (`node --test dist-test/**/*.test.js`). |
| `npm run test-some` | Run tests matching `TEST_PATTERN` (env var). |
| `npm run test-cov` | Run tests with coverage, writing `coverage/lcov.info`. |
| `npm run watch` | Recompile on change (`tsc --build -w`). |
| `npm run model` | Run the CLI in watch mode on the package's own `model/sys.jsonic`. |
| `npm run test-model` | Run the CLI once on `test/sys01/model/model.jsonic`. |
| `npm run clean` | Remove `node_modules`, `dist`, `dist-test`, lockfiles. |
| `npm run reset` | `clean` + install + build + test. |

> Always `build` before `test`: tests run against compiled output in
> `dist-test/`, importing the compiled library from `dist/`. Run these scripts
> from the `ts/` directory.


## Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Build fails with a `syntax` / parse error | An unquoted key contains a hyphen or other punctuation (`env-file:`). Use an identifier (`envFile`) or quote it (`'env-file':`). |
| Model "fails to generate", or a field is reported as nil/incomplete | A bare type constraint (`name: string`) survived into the output with nothing to satisfy it. Give it a default (`name: *'' \| string`) or make it optional (`name?: string`), or provide a concrete value. |
| `Unknown model action "X"` | `sys.model.order.action` names an action that has no `sys.model.action.X` definition. Add the action or fix the order list. |
| `Model action "X" is missing a "load" path` | An action definition has no `load`. Add `load: 'build/X'`. |
| A required action does not run | Check its `step` (`pre`/`post`/`all`) and that it appears in `order.action` (or that `order.action` is absent so all run). |
| In-memory (`fs`) build fails to resolve `@voxgig/model/...` | The auto-created config imports a package path that is not in your volume. Seed a self-contained `.model-config/model-config.jsonic` (e.g. `sys: model: action: {}`). |
| Watch process never exits | This is expected for `--watch` (runs until interrupted). For the API, call `model.stop()`. |
| A change does not trigger a rebuild | Only tracked files rebuild: the root model, its imports, and the config files. Editing an unrelated file does nothing. Also note `add`/`rem` events are off by default in the API (`watch: { add, rem }`). |
| Edits seem ignored after a failed build | Errors reset each build; fix the source and the next rebuild should succeed. If running the repo's own tooling, ensure you rebuilt (`dist/` can go stale — see [AGENTS.md](../AGENTS.md)). |


## Requirements

- **Node.js.** CI tests on Node 24 (recommended). Node 20.19+ generally works;
  the `shape` dependency declares `engines.node >= 24`, so older versions emit
  an `EBADENGINE` warning.
- **Peer dependencies:** `pino` (`>=10`) and `@voxgig/util`. Install them in the
  host project.
- **Module system:** CommonJS (`"type": "commonjs"`).
