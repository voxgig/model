# AGENTS.md

Guidance for AI coding agents (and humans) working **on** the `@voxgig/model`
codebase. For using the tool, start at the [README](./README.md) and
[docs/](./docs/). This file is about developing the package itself.

Keep this file accurate: if you change the build, test layout, or a convention
below, update it in the same change.


## What this project is

`@voxgig/model` unifies `.jsonic` source into a single JSON model (via the
[aontu](https://github.com/voxgig/aontu) CUE-style engine) and runs generator
"actions" over it. It can build once or watch and rebuild. It ships a library
(`Model`) and a CLI (`voxgig-model`).

A 90-second tour of how it fits together is in
[docs/explanation.md](./docs/explanation.md#architecture-at-a-glance). Read that
before making structural changes.


## Environment

- **Node.js 24** is the target (CI matrix). Node 20.19+ works; the `shape`
  dependency declares `engines.node >= 24`, so older Node prints an
  `EBADENGINE` warning — harmless here.
- TypeScript, CommonJS output (`"type": "commonjs"`).
- Install with `npm install`. No lockfile is committed (it is gitignored).


## Build, test, run

```bash
npm install            # once
npm run build          # tsc --build src test  -> dist/ and dist-test/
npm test               # node --test dist-test/**/*.test.js
```

```bash
# a single suite / pattern
TEST_PATTERN='watch' npm run test-some

# coverage (writes coverage/lcov.info)
npm run test-cov

# recompile on save
npm run watch

# exercise the CLI against the bundled sample model
npm run test-model     # build once on test/sys01/model/model.jsonic
npm run model          # watch model/sys.jsonic
```

**You must `npm run build` before `npm test`.** Tests are TypeScript compiled to
`dist-test/`, and they import the compiled library from `dist/`. Source edits do
not take effect in tests until rebuilt. For a fully clean rebuild use
`npx tsc --build src test --force`.


## Critical gotchas

1. **Run commands from the repository root.** `tsc --build src test` resolves
   `src` and `test` as project paths relative to the current directory. Running
   it from a subdirectory fails with `TS5083: Cannot read file '.../src/
   tsconfig.json'` and silently leaves `dist/` stale — so tests then run against
   old code. If a build looks like it "passed" but tests don't reflect your
   change, check your working directory.

2. **`dist/` and `dist-test/` are committed.** They are tracked in git (in the
   `files` allowlist for publishing). After any source change, rebuild and
   commit the regenerated `dist/`/`dist-test/` alongside the `.ts`. CI rebuilds
   them, but the repo convention is to commit them.

3. **The CLI (`bin/voxgig-model`) is plain JavaScript**, not compiled. Edits to
   it take effect immediately (no build needed for the bin itself), but it
   `require`s `dist/model.js`, so the library must be built.

4. **`aontu` reads `opts.err`, not `opts.errs`.** When invoking
   `aontu.generate(src, opts)`, set `opts.err = <array>` to enable collect mode
   (errors gathered into the array instead of thrown). This is easy to get
   wrong — see `src/build.ts: resolveModel`.

5. **Generated test fixtures go in `test/_gen/`** (gitignored). Tests write their
   own fixtures there at runtime; do not commit them. See "Writing tests".


## Repository map

```
src/
  model.ts            Model: public entry; wires config build + model build
  config.ts           Config: specialized build for .model-config
  watch.ts            Watch: chokidar, debounce, rebuild queue, dep tracking
  build.ts            BuildImpl/makeBuild: resolve model (aontu) + run producers
  types.ts            shared interfaces (Build, BuildSpec, Producer, ...)
  producer/
    model.ts          model_producer: write the unified model as JSON
    local.ts          local_producer: load & run actions declared in config
  tsconfig.json       project config for src

bin/voxgig-model      CLI entry (plain JS): arg parsing -> new Model().run/start

test/
  *.test.ts           node:test suites (compiled to dist-test/)
  tsconfig.json       project config for tests
  sys01/, p01/, e01/, w01/   committed fixtures
  _gen/               GITIGNORED scratch fixtures written by tests at runtime

model/                the package's own sample model (sys.jsonic + config)
dist/, dist-test/     COMMITTED build output
docs/                 tutorial / how-to / reference / explanation
```

Data flow: `CLI/Model` → `Config` (resolves actions) + `Watch` → `BuildImpl`
(`aontu` unify → producers). The model build runs `model_producer` then
`local_producer`. Full detail:
[docs/explanation.md](./docs/explanation.md).


## Code conventions

Match the surrounding style; in this codebase that means:

- **2-space indent, no semicolons, single quotes.**
- Prefer `let`; use `const` where the existing file does.
- Null checks as `null == x` / `null != x`. Comparisons are often "yoda"
  (`'post' === ctx.step`). Follow the local file.
- CommonJS modules. Keep imports grouped: node builtins, then deps, then local.
- Keep the public type surface in `src/types.ts`. Many internal fields are typed
  `any` by design; do not tighten them speculatively.
- Logging goes through the pino logger (`build.log` / `this.log`) with a `point`
  (short event name) and a human `note`. Do not `console.log` in library code.
- Copyright header comment at the top of each source file (see existing files).


## Writing tests

- Use `node:test` (`describe`/`test`) and `node:assert`. Import the library from
  `../dist/...` (compiled output), mirroring existing suites.
- **Put runtime fixtures under `test/_gen/<name>/`** and create them in the test
  (write `.jsonic`, config, and any action `.js`). This keeps fixtures
  self-contained and out of git. Clean the dir at the start of the test
  (`rm -rf` then `mkdir -p`).
- **Watch-mode tests must call `model.stop()` in a `finally`.** `start()` opens
  chokidar watchers (for both the model and the config); leaving them open hangs
  the test process. Poll for the expected result with a timeout helper rather
  than fixed sleeps (see `test/watch.test.ts`).
- **CLI tests** spawn the built bin without a shell, for cross-platform
  safety:
  ```js
  const { spawnSync } = require('node:child_process')
  const res = spawnSync(process.execPath, [BIN, modelPath, '-b', '{a:1}'],
                        { encoding: 'utf8' })
  ```
  Use jsonic barewords (`{a:b}`) to avoid embedded-quote escaping.
- Make tests **meaningful guards**: when adding a test for a fix, confirm it
  fails without the fix (temporarily revert, run, restore).

Existing suites to model new ones on:

| Suite | Covers |
|-------|--------|
| `test/build.test.ts` | end-to-end builds (`makeBuild`, `Model.run`) with the `p01`/`sys01` fixtures |
| `test/fix.test.ts` | error recovery, unknown/misconfigured actions, dry-run filesystem |
| `test/watch.test.ts` | watch rebuilds on model and config changes |
| `test/cli.test.ts` | the CLI passes build args through to actions |


## Common tasks (playbooks)

### Add a build action (product-level generator)
Actions are user-space, not framework code — declare in a model's
`.model-config/model-config.jsonic` and implement under `build/`. See
[docs/how-to.md](./docs/how-to.md#write-a-build-action). No library change.

### Add a built-in producer (framework-level)
1. Create `src/producer/<name>.ts` exporting a `Producer`
   `(build, ctx) => Promise<ProducerResult>` (see `src/producer/model.ts`).
2. Add it to the pipeline in `src/model.ts` (`this.build.res`), or document it
   for `makeBuild` users.
3. Rebuild, add a test, commit `dist/` too.

### Add or change a CLI flag
Edit `bin/voxgig-model`: add to `resolveOptions` (`parseArgs` `options`) and
`validateOptions` (the `Shape`), then include it in the `spec` passed to
`new Model(spec)`. Thread the field through `ModelSpec` in `src/types.ts` and
read it in the `Model` constructor. (The CLI maps `--build` → `buildargs`; keep
spec keys aligned with `ModelSpec`.)

### Change the model/build types
Edit `src/types.ts`. Rebuild so `dist/*.d.ts` regenerates; commit them.

### Touch the build/error/cache logic
`src/build.ts`. Remember the `opts.err` collect-mode rule (gotcha #4) and that
`this.errs` is reset per run so a reused build instance doesn't accumulate stale
errors. Add a regression test in `test/fix.test.ts`.


## Before you commit

- `npm run build` is clean (`tsc rc 0`) **from the repo root**.
- `npm test` is green; add/adjust tests for behavior changes.
- Regenerated `dist/` and `dist-test/` are staged with the source.
- No `test/_gen/` artifacts are staged (they are gitignored — verify with
  `git status`).
- Keep this file and `docs/` in sync with any behavior or convention change.


## More documentation

- [docs/tutorial.md](./docs/tutorial.md) — learn the tool by building a model.
- [docs/how-to.md](./docs/how-to.md) — task recipes.
- [docs/reference.md](./docs/reference.md) — CLI, API, config, language.
- [docs/explanation.md](./docs/explanation.md) — architecture and design
  rationale (read before structural changes).
