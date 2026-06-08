# AGENTS.md

Guidance for AI coding agents (and humans) working **on** the `@voxgig/model`
codebase. For using the tool, start at the [README](./README.md) and
[docs/](./docs/). This file is about developing the package itself.

This repository holds **two implementations** of the same tool:

- **`ts/`** — the TypeScript package `@voxgig/model` (npm library + CLI).
  **TypeScript is canonical.**
- **`go/`** — the Go module `github.com/voxgig/model/go`, kept in architectural
  parity with the TypeScript version.

Keep this file accurate: if you change the build, test layout, or a convention,
update it in the same change.


## Layout

```
ts/                 TypeScript implementation (canonical)
  src/              library source (model.ts, build.ts, watch.ts, ...)
  test/             node:test suites
  dist/ dist-test/  COMMITTED build output
  bin/voxgig-model  CLI entry (plain JS)
  model/            the package's own sample model
  package.json
go/                 Go implementation (parity)
  *.go              package `model` (build.go, producer.go, watch.go, ...)
  cmd/voxgig-model/ Go CLI entry
  *_test.go         go test suites
  go.mod  go.sum
docs/               tutorial / how-to / reference / explanation
Makefile            orchestrates both: `make build`, `make test`
.github/workflows/  CI (a `ts` job and a `go` job)
```


## Build & test

From the repository root, `make` drives both implementations:

```bash
make build     # build-ts + build-go
make test      # test-ts + test-go
make           # all: build then test
```

### TypeScript (run from `ts/`)

```bash
cd ts
npm install
npm run build              # tsc --build src test  -> dist/ and dist-test/
npm test                   # node --test dist-test/**/*.test.js
TEST_PATTERN=watch npm run test-some
npm run test-cov
```

**You must `npm run build` before `npm test`** — tests run against compiled
output in `dist-test/` and import the library from `dist/`.

### Go (run from `go/`)

```bash
cd go
go build ./...
go vet ./...
gofmt -l .                 # must print nothing
go test ./...
```

Go **1.24+** is required (the `aontu/go` dependency declares `go 1.24.7`).


## Critical gotchas (TypeScript)

1. **Run TS commands from `ts/`.** `tsc --build src test` resolves `src` and
   `test` as project paths relative to the current directory; from the wrong
   directory it fails with `TS5083` and silently leaves `dist/` stale — so
   tests then run against old code.

2. **`ts/dist/` and `ts/dist-test/` are committed.** After any source change,
   rebuild and commit the regenerated output alongside the `.ts`.

3. **The CLI (`ts/bin/voxgig-model`) is plain JavaScript**, not compiled. It
   `require`s `dist/model.js`, so the library must be built.

4. **`aontu` (npm) reads `opts.err`, not `opts.errs`** — collect mode. See
   `ts/src/build.ts: resolveModel`.

5. **Generated test fixtures go in `ts/test/_gen/`** (gitignored). Tests write
   their own fixtures there at runtime; do not commit them.


## The Go port

The Go module ports the **architecture**, not every mechanism. The build
lifecycle (pre → reload → post), producers, model output, dryrun, and watch
semantics match TypeScript. Two things differ by necessity:

- **The config declares actions; the registry binds them.** Like TypeScript,
  Go resolves `.model-config/model-config.jsonic` (auto-created when missing),
  writes `model-config.json`, and takes the action order from
  `sys.model.order.action` (`go/config.go`). But Go cannot load code at
  runtime, so the action *functions* are registered programmatically via
  `ModelSpec.Actions` (`map[string]ActionDef`) and bound to the
  config-declared names — see `go/producer.go`.
- **Watching polls modification times** (`go/watch.go`) rather than using
  chokidar.

Other notes:

- **Unification** uses the real Go aontu engine
  (`github.com/rjrodger/aontu/go`). Its `Generate(src)` has no base parameter,
  so `AontuResolver` briefly `chdir`s to the model base (guarded by a mutex)
  so `@"..."` imports resolve. aontu/go does not report import deps, so the
  watcher tracks `*.jsonic` files under the base directory.
- **JSON key order** differs: Go's `encoding/json` sorts object keys;
  TypeScript preserves insertion order. Content is otherwise equivalent — an
  accepted cross-language difference.
- **`const Version`** lives in `go/model.go`; `make publish-go V=x.y.z`
  rewrites it and tags `go/vx.y.z`.
- The Go port depends on **`aontu/go` only**; it does not use `util/go` (the
  TypeScript `@voxgig/util` dependency is for pino logging, replaced here by a
  minimal `Log` interface).


## Maintaining parity

TypeScript is canonical. When changing behavior:

1. Change TypeScript first, with a test (`ts/test/*.test.ts`).
2. Apply the equivalent change to Go, with a test (`go/*_test.go`).
3. Rebuild TypeScript and commit the regenerated `ts/dist/`.
4. Run both suites (`make test`); keep `gofmt`/`go vet` clean.
5. Update `docs/` if the API changed.


## Writing tests

**TypeScript:** `node:test` (`describe`/`test`), import from `../dist/...`.
Runtime fixtures under `ts/test/_gen/<name>/`, created in the test. Watch tests
must `await model.stop()` in a `finally`. CLI tests spawn the built bin without
a shell.

**Go:** standard `testing` with `t.TempDir()` fixtures. Watch tests must
`defer m.Stop()`. Do **not** `t.Parallel()` resolver-using tests —
`AontuResolver` changes the working directory.


## Common tasks (playbooks)

### Add a build action (product-level generator)
User-space, not framework code. TypeScript: declare in
`.model-config/model-config.jsonic`, implement under `build/`. Go: register an
`ActionDef` in `ModelSpec.Actions`. See
[docs/how-to.md](./docs/how-to.md#write-a-build-action).

### Add a built-in producer (framework-level)
TypeScript: add `ts/src/producer/<name>.ts`, wire it into `ts/src/model.ts`.
Go: add a `Producer` func in `go/producer.go`, wire it into `go/model.go`.
Rebuild and test both; commit `ts/dist/`.

### Change the model/build types
TypeScript: `ts/src/types.ts`. Go: `go/types.go`. Keep the two aligned.


## Before you commit

- `make build` is clean and `make test` is green (both languages).
- Regenerated `ts/dist/` and `ts/dist-test/` are staged with the source.
- `gofmt -l go` prints nothing; `cd go && go vet ./...` is clean.
- No `ts/test/_gen/` artifacts are staged.
- This file and `docs/` reflect any behavior or convention change.


## More documentation

- [docs/tutorial.md](./docs/tutorial.md) — learn the tool by building a model.
- [docs/how-to.md](./docs/how-to.md) — task recipes.
- [docs/reference.md](./docs/reference.md) — CLI, API, config, language.
- [docs/explanation.md](./docs/explanation.md) — architecture and design
  rationale (read before structural changes).
