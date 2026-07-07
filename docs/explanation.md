# Explanation: concepts and design

This document explains *why* `@voxgig/model` works the way it does. It is
background reading, not a task list — for steps see the
[tutorial](./tutorial.md) and [how-to guides](./how-to.md), and for exhaustive
detail the [reference](./reference.md).

- [The problem: one model, many artifacts](#the-problem-one-model-many-artifacts)
- [Why unification](#why-unification)
- [Architecture at a glance](#architecture-at-a-glance)
- [The build lifecycle](#the-build-lifecycle)
- [Producers and actions](#producers-and-actions)
- [Why there are two builds](#why-there-are-two-builds)
- [Watching and incremental rebuilds](#watching-and-incremental-rebuilds)
- [Caching](#caching)
- [Dry run and the filesystem boundary](#dry-run-and-the-filesystem-boundary)
- [Error handling philosophy](#error-handling-philosophy)
- [Known limitations](#known-limitations)
- [Status](#status)


## The problem: one model, many artifacts

Most non-trivial systems describe the *same* concepts in many places: an API is
defined in route code, in an OpenAPI file, in client SDKs, in infrastructure
config, in documentation, in test fixtures. Each copy drifts from the others.
The cost of a change is multiplied by the number of representations, and the
bugs live in the gaps between them.

`@voxgig/model` is a framework for **universal application modeling**: describe
the system once, as a single declarative model, then *generate* every
downstream artifact from that one source. The model is the truth; the code,
config, and docs are projections of it.

This is a generative approach. The tool itself is deliberately small: its job is
to turn source into a trustworthy unified model and hand that model to
generators (here called **actions**). The domain knowledge lives in your model
and your actions, not in the framework.


## Why unification

A model needs to express more than values — it needs rules: defaults,
constraints, types, and composition. Plain JSON or YAML cannot; they only carry
data, so the rules end up in code that interprets the data.

`@voxgig/model` borrows from [CUE](https://cuelang.org) (via the
[aontu](https://github.com/voxgig/aontu) engine) and uses **unification** as its
core operation. Unification merges two descriptions into the single most
specific description consistent with both — or fails if they conflict. A few
consequences make this powerful for modeling:

- **Types and values are the same kind of thing.** `port: integer` and
  `port: 8080` unify to `8080`; `port: 1` and `port: 2` *conflict* and fail.
  Validation is not a separate pass — it is what unification does.
- **Order does not matter.** `a & b` is the same as `b & a`. You can layer a
  base shape, environment overrides, and per-instance tweaks in any arrangement
  and get the same result.
- **Defaults are first-class.** `*true | boolean` says "default to `true`, but
  any boolean is allowed." Composition naturally fills in defaults only where
  nothing more specific was said.
- **Composition is explicit and safe.** Reusing a shape with `&` cannot quietly
  produce something that violates the shape — a conflict is an error, not a
  silent overwrite.

The result of resolving a model is a single canonical data structure (written as
`model.json`) with every default applied and every constraint satisfied. That
structure is what actions consume.


## Architecture at a glance

The pieces, from outside in:

```
CLI (bin/voxgig-model)
  └─ Model                         orchestrates the whole thing
       ├─ Config   ── Watch        resolves .model-config, declares actions
       └─ Watch                    resolves the main model, runs actions
            └─ Build (BuildImpl)   resolve + run the producer pipeline
                 ├─ aontu          unify source into a model
                 └─ producers
                      ├─ model_producer   write model.json
                      └─ local_producer   load & run your actions
```

| Component | File | Responsibility |
|-----------|------|----------------|
| `Model` | `ts/src/model.ts` | Public entry. Wires a config build and a model build together; exposes `run`/`start`/`stop`. |
| `Config` | `ts/src/config.ts` | A specialized build for `.model-config/model-config.aontu`. |
| `Watch` | `ts/src/watch.ts` | File watching, debouncing, the rebuild queue, dependency tracking. |
| `Build` / `BuildImpl` | `ts/src/build.ts` | One build: resolve the model via aontu, run the producer pipeline, cache by mtime. |
| `model_producer` | `ts/src/producer/model.ts` | Serialize the unified model to JSON. |
| `local_producer` | `ts/src/producer/local.ts` | Load action modules from config and run them. |
| types | `ts/src/types.ts` | The shared interfaces (`Build`, `BuildSpec`, `Producer`, …). |

`aontu` (unification), `chokidar` (file watching), `memfs` (the dry-run
filesystem), and `pino`/`@voxgig/util` (logging) are the external moving parts.


## The build lifecycle

A single build is a small state machine (`BuildImpl.run`):

1. **Reset error state.** A build instance is reused across watch rebuilds, so
   each run starts with a clean slate.
2. **Resolve the model.** Read the root file and unify it (and its imports) with
   aontu into `build.model`. If nothing relevant changed since last time, the
   cached model is reused (see [Caching](#caching)).
3. **Pre phase.** Run every producer with `step = 'pre'`. Producers may signal
   `reload` if they changed model source.
4. **Reload if asked.** If a pre-producer requested a reload and there were no
   errors, resolve the model again so the post phase sees the new source.
5. **Post phase.** Run every producer with `step = 'post'`.
6. **Return a result.** `ok`, the per-producer results, collected `errs`, and a
   `runlog` of the phases.

The `pre` → `reload` → `post` shape exists for a specific need: actions that
*generate model source*. A code generator might emit a `.aontu` fragment that
the model itself imports; running it in `pre` and reloading lets that generated
source participate in the final model that `post` actions consume.


## Producers and actions

There are two extension layers, and the distinction matters.

A **producer** is the low-level unit: a function `(build, ctx) => ProducerResult`
that the build runs in both phases. Producers are how the pipeline is assembled.
The framework ships two — one to write the model JSON, one to run actions.

An **action** is the high-level, user-facing unit: a JS module declared in the
config file. Actions exist because most users do not want to think about the
producer protocol — they want "given the model, write these files." The
`local_producer` is the bridge: it reads the action declarations from the config
model, loads the modules, and runs them at the right phase.

So: *producers are the framework's plug-in mechanism; actions are the product's
plug-in mechanism.* Use actions for normal generation. Drop to a custom producer
pipeline (via `makeBuild`) when you need control over the whole build.


## Why there are two builds

A model build needs to know which actions to run *before* it can run them — and
that list is itself modeled, in `.model-config/model-config.aontu`. So a `Model`
resolves **two** models:

1. The **config build** unifies the config file into a config model and writes
   `model-config.json`. Its declarations (`sys.model.action`, `sys.model.order`)
   tell the main build what to do.
2. The **model build** unifies your root model, writes `model.json`, and runs
   the actions the config declared.

Treating config as just another model is deliberate: the config benefits from
the same unification, defaults, and imports as everything else. A shared base
config can be imported by package path, and projects layer their own actions on
top.

An internal trigger producer on the config build kicks off the model build, so
the two stay in step. In watch mode both the model's sources and the config's
sources are watched, and a change to either rebuilds the model.

The config build is **optional**. When a `Model` is created with `config: false`
(or the CLI is run with `--no-config`), only the model build runs: nothing is
auto-created under `.model-config/`, no actions are declared or run, and the
model JSON is still written. This suits cases where you only want the unified
model — for example, generating `model.json` for another tool to consume.


## Watching and incremental rebuilds

Watch mode is built around three ideas:

- **Dependency tracking.** aontu records every file a model imports. After each
  successful build the watcher adds those files (plus the root) to the set it
  watches, so editing an imported fragment rebuilds the whole model.
- **Debouncing.** External tools often write many files in a burst (a compiler
  emitting output, a formatter rewriting a tree). The watcher waits for an
  `idle` quiet period (default 111 ms) after the last change before queuing a
  build, coalescing the burst into one rebuild.
- **A serial queue.** Changes enqueue build requests that drain one at a time,
  so rebuilds never overlap within a watcher.

Because the model build and config build are separate watchers, the model's
sources and the config's sources are tracked independently; a config edit
rebuilds the config, which re-triggers the model build.


## Caching

Re-unifying a large model on every keystroke is wasteful, so a build caches its
last result by a **signature** of file modification times. After a successful
resolve, the build snapshots the mtime of the root file and every recorded
dependency. On the next resolve, if every tracked file still has the same mtime,
the cached model is reused and unification is skipped entirely.

This is why `model_producer` skips writing when the output is byte-identical:
rewriting an unchanged file would bump its mtime, invalidate caches downstream,
and re-trigger watchers in a loop. Avoiding needless writes keeps incremental
rebuilds cheap and prevents feedback loops between cooperating tools.


## Dry run and the filesystem boundary

Every build carries an `fs` object, and producers/actions are expected to write
through `build.fs` rather than importing `fs` directly. That indirection is the
seam that makes `--dryrun` work: in dry-run mode the build swaps the write
methods (both synchronous and promise-based) for ones backed by an in-memory
[`memfs`](https://github.com/streamich/memfs) volume. Reads still hit the real
disk; writes go nowhere. The same seam lets you supply any `fs` implementation
to build entirely in memory.

This is a pragmatic, internal-use safeguard — it covers the standard write
methods, not every conceivable path to disk. An action that bypasses `build.fs`
escapes it.


## Error handling philosophy

Builds aim to **fail loudly and recover cleanly**:

- A build collects errors rather than throwing on the first one where it can, so
  a `BuildResult` reports what went wrong.
- Error state is reset at the start of each build. A build instance is reused
  across watch rebuilds, so without this a single transient failure would stick
  to every later build. Resetting means a watcher self-heals: fix the source and
  the next rebuild succeeds.
- Model (unification) errors, missing files, unknown or misconfigured actions,
  and actions that throw all converge on the same outcome — `ok: false` with the
  cause in `errs` — so callers have one thing to check.


## Known limitations

This is an early framework; some sharp edges are known and documented rather
than hidden:

- **Concurrent model builds.** A change to a config file triggers a model
  rebuild directly, outside the model watcher's serial queue. If a config file
  and a model file change at the very same moment, two model builds can overlap.
  The per-build error reset makes this self-healing, but unifying the two
  watchers' queues is future work.
- **Dry-run coverage.** The read-only filesystem shim covers the common write
  methods; it is explicitly "not complete." Treat `--dryrun` as a strong
  convenience, not a security boundary.
- **Project layout assumption.** Action `load` paths resolve against the
  directory two levels above the root model file, which bakes in the
  `project/model/model.aontu` convention.
- **Error capture in the language layer.** Capturing *all* syntax and model
  errors as structured data (rather than some surfacing as thrown exceptions)
  depends on continued work in aontu.


## Status

`@voxgig/model` is a **prototype**. The concepts — model-once, generate-many,
unification as the core operation — are stable and intended; the specific APIs,
file conventions, and internals may still change. It is inspired by, and tracks
the ideas of, [CUE](https://cuelang.org).
