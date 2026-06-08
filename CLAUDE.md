# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

This repo has **two implementations**: `ts/` (TypeScript, canonical) and `go/`
(Go, in parity). The full contributor/agent guide is in **@AGENTS.md** — read
it before making changes. The essentials:

## Build & test
- From the root, `make build` and `make test` drive both languages.
- **TypeScript** (`cd ts`): `npm run build` (`tsc --build src test`) **before**
  `npm test`. `ts/dist/` and `ts/dist-test/` are **committed** — rebuild and
  stage them with any source change.
- **Go** (`cd go`): `go build ./...`, `go vet ./...`, `gofmt -l .`,
  `go test ./...`. Go 1.24+.

## Watch out for
- Run TS commands **from `ts/`**: `tsc --build src test` resolves project paths
  relative to cwd (`TS5083` otherwise), and a failed build leaves stale `dist/`.
- Watch tests must release watchers (`await model.stop()` / `defer m.Stop()`),
  or the process hangs.
- TS runtime fixtures belong in `ts/test/_gen/` (gitignored).
- TS: `aontu.generate` collects errors only with `opts.err` (not `opts.errs`).
- Go: `AontuResolver` `chdir`s to the model base — don't `t.Parallel()` tests
  that resolve.

## Parity
TypeScript is canonical. Change TS (with a test) first, then mirror in Go (with
a test), rebuild `ts/dist/`, and run `make test`. Keep the two in step.

## Style
- TS: 2-space indent, no semicolons, single quotes, CommonJS. Match the file.
- Go: standard `gofmt`; package `model`; `/* Copyright © ... */` header.
- Never `console.log` in TS library code (use the pino logger); in Go log
  through the `Log` interface.

When you change behavior or a convention, update `@AGENTS.md` and the relevant
file in `docs/` in the same change.
