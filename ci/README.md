# CI workflow (apply manually)

This folder mirrors the repository's `.github/` directory with the workflow
updated for the dual-language (`ts/` + `go/`) layout. It lives here because the
workflow file could not be pushed automatically — the session's token lacked
the GitHub `workflow` scope.

## Apply

Copy it over the repository root, then commit:

```bash
cp -r ci/.github/. .github/
git add .github/workflows/build.yml
git commit -m "ci: build and test ts/ and go/"
```

(Equivalently, copy `ci/.github/workflows/build.yml` to
`.github/workflows/build.yml`.)

## What changed

The previous workflow ran `npm` from the repository root, which no longer
works now that the TypeScript package lives in `ts/`. The updated `build.yml`
has two jobs:

- **ts** — `npm i` / `npm run build` / `npm test` in `ts/`, across
  ubuntu/windows/macOS (Node 24), plus `test-cov` + Coveralls on ubuntu
  (`path-to-lcov: ./ts/coverage/lcov.info`).
- **go** — `go build` / `go vet` / `go test` in `go/`, across the same OSes
  (Go 1.24), with a `gofmt` check on ubuntu (formatting is OS-independent, so
  one check suffices).

Once applied, this `ci/` folder can be deleted.
