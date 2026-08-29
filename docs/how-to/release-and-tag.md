# Release and tag

How `@voxgig/model` (npm) and `github.com/voxgig/model/go` (Go module) are
released. Read this before releasing anything: parts of it are irreversible.

Adapted from
[`voxgig/apidef`'s release-and-tag doc](https://github.com/voxgig/apidef/blob/main/docs/how-to/release-and-tag.md),
which this repository's `publish.yml` now mirrors.


## The rule

**Every release is tagged, and the two artifacts release together.**

- npm publish → tag `v<version>`
- Go module → tag `go/v<VERSION>`

A published version with no tag is a defect: nothing in git marks the commit
the registry was built from. The workflow enforces this by doing both in one
run — publish first, tag second.


## Two artifacts, two version series

| artifact | version lives in | released by | tag |
| --- | --- | --- | --- |
| npm `@voxgig/model` | `ts/package.json` `"version"` | publishing to the registry | `v<version>` |
| Go `github.com/voxgig/model/go` | `go/model.go` `const VERSION` | **the tag itself** | `go/v<VERSION>` |

The second row surprises people. A Go module has no upload step:
`proxy.golang.org` serves whatever a tag points at, so **pushing the tag is
the release**. The proxy and sum database cache a version permanently. Moving
or deleting a tag reaches users as a checksum mismatch — a security error, not
a missing version. Withdraw only via `retract` in a new version.

**The numbers are deliberately different.** npm is at 10.x; the Go module is
at 0.x. "Parity" means the two are *released together and kept in
architectural step* — not that they carry the same number. Making them match
would put the module at v10, and a Go module at v2 or above must carry the
major in its path:

```
module github.com/voxgig/model/go/v10
```

That rewrites every consumer's import paths. It is a deliberate one-time
migration if it is ever wanted, never a release chore.


## Releasing

Bump the version(s) in a normal reviewed PR, merge to `main`, then dispatch:

```sh
gh workflow run publish.yml --ref main -f npm=true -f go=true
```

Or **Actions → publish → Run workflow** on `main`, with the two checkboxes.

Nothing in the workflow commits. It reads the versions already on the branch
and releases exactly those, so the bump stays a reviewable diff and the
release stays a button.

Release only one half by unticking the other:

- **npm only** (`go=false`) — TypeScript changed, Go did not.
- **Go only** (`npm=false`) — Go changed, or the module needs a tag for a
  release that already reached npm.


## What the workflow guards

In order, failing closed until the publish:

1. **Dispatches must come from `main`.** `--ref` accepts any branch, and
   publishing a feature branch is irreversible.
2. **`expect_sha`**, when supplied, refuses if `main` moved since the release
   commit — `--ref main` names a mutable branch.
3. **A pushed tag must match `ts/package.json`.** Otherwise pushing `v10.2.0`
   while the file says `10.1.0` releases 10.1.0, finds it published, skips,
   and goes green — leaving a tag with no release behind it.
4. **A tag on a *different* commit is refused**; a tag already on *this*
   commit is a no-op. That distinction is what makes re-dispatch safe after a
   partial release.
5. **Build and test both languages**, Go included — `build.yml` covers Go on
   pushes and PRs, but the tag is irreversible, so it is gated here too.
6. **Is the version already on npm?** The registry, not the tag, is the
   source of truth for "released". Without this, a run that published and then
   failed to tag could never be completed: the publish step would die on
   "cannot publish over the previously published versions".
7. **A published version must come from this commit**, verified via npm's
   recorded `gitHead`. Skipping a publish assumes "same version means same
   code", which only holds if `main` has not moved. Absent `gitHead` warns
   rather than blocks, so recovery stays possible.
8. **Publish**, then **tag** — the tag job `needs` the publish job, so a tag
   only ever exists for a release that reached the registry.


## Why the workflow is shaped the way it is

**One file.** npm registers a trusted publisher against one owner, one repo,
and a single workflow *filename*. Only that file can publish, so anything that
must accompany a publish — the tags — has to live inside it. An OIDC token
from an unregistered workflow is refused as **404, not 403**, so as not to
leak whether the package exists. It reads as "the package does not exist",
which is nonsense and costs an hour if you have not seen it before. Renaming
`publish.yml` breaks publishing until the npm-side entry is updated.

**Two jobs.** The publish job holds `id-token: write` with `contents: read`
and runs `npm i`, the build and the tests. The tag job holds
`contents: write` and runs git and nothing else. Combined, every dependency
`postinstall` from `npm i` would run alongside a repository-write credential,
because `checkout` persists its token into the git config for the whole job.

**Not two files.** A ref pushed with `GITHUB_TOKEN` starts no further workflow
run — GitHub suppresses that so workflows cannot trigger themselves. So "tag
in A, publish on the tag" publishes nothing, silently.


## Recovering

| state | what to do |
| --- | --- |
| Published, tagging failed | Re-dispatch. The registry check skips the publish and the tag job retries. |
| On npm with no tag | Re-dispatch from the commit npm's `gitHead` names. Guard 7 refuses any other commit — correctly: the tag must point at the code the registry holds. |
| Tag pushed by hand, no release | The `push: tags v*` trigger publishes but does not tag. Check the run went green. |
| Wrong commit tagged for Go | Do **not** move it. Bump the patch and tag again; the proxy caches immutably. |
| npm refuses the publish | The version exists. Bump and release again — npm never allows republishing. |


## Known gaps

- **`v10.1.0` was published untagged**, on 2026-08-28, before this workflow
  existed (the old `publish.yml` held `contents: read` in a single job and
  could not tag). It was built from the commit npm records as its `gitHead`.
  The same is true of 10.0.0 through 10.0.2, and the last `v*` tag before this
  change was `v9.4.1`. Tagging one of those retroactively means pushing the
  tag by hand at the published commit, which fires the *old* workflow from
  that ref — for a push event GitHub uses the workflow file as it existed at
  the tagged commit, and the old file has no registry check, so it will try to
  republish and fail red. That failure is cosmetic but noisy; weigh it against
  leaving the version untagged.
- **Never run `npm run repo-publish` locally.** It publishes over a token and
  bypasses OIDC entirely.
