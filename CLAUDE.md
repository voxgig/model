# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

The full contributor/agent guide — environment, repository map, conventions,
test patterns, and task playbooks — is in **@AGENTS.md**. Read it before making
changes. The essentials:

## Build & test
- Run everything **from the repository root**.
- `npm run build` (`tsc --build src test`) **before** `npm test`; tests run
  against compiled output in `dist-test/` and import the library from `dist/`.
- `dist/` and `dist-test/` are **committed** — rebuild and stage them with any
  source change.
- Single suite: `TEST_PATTERN='<name>' npm run test-some`. Coverage:
  `npm run test-cov`.

## Watch out for
- Stale `dist/` from a build that failed because it ran in a subdirectory
  (`TS5083`) — tests then pass against old code. Verify cwd is the repo root.
- Watch-mode tests must `await model.stop()` in a `finally`, or the process
  hangs on open file watchers.
- Runtime test fixtures belong in `test/_gen/` (gitignored); don't commit them.
- `aontu.generate` collects errors only when given `opts.err` (not `opts.errs`).

## Where things are
- Library: `src/` (`model.ts`, `config.ts`, `watch.ts`, `build.ts`, `types.ts`,
  `producer/`). CLI: `bin/voxgig-model` (plain JS). Docs: `docs/`.
- Architecture overview: `docs/explanation.md`.

## Style
- 2-space indent, no semicolons, single quotes, CommonJS. Match the local file.
- Log via the pino logger (`build.log`/`this.log`), never `console.log` in
  library code.

When you change behavior or a convention, update `@AGENTS.md` and the relevant
file in `docs/` in the same change.
