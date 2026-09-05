.PHONY: all build test clean build-ts build-go test-ts test-go vet-go scan-prose clean-ts clean-go bump-go publish tags-go tags-npm reset

all: build test

build: build-ts build-go

test: test-ts test-go scan-prose

clean: clean-ts clean-go

# TypeScript (the npm package lives in ts/) — the canonical implementation.
build-ts:
	cd ts && npm run build

test-ts:
	cd ts && npm test

cov-ts:
	cd ts && npm run test-cov

clean-ts:
	rm -rf ts/dist ts/dist-test ts/node_modules

# Go (the module lives in go/) — kept in parity with TypeScript.
build-go:
	cd go && go build ./...

test-go:
	cd go && go test -v ./...

vet-go:
	cd go && go vet ./... && gofmt -l .

clean-go:
	cd go && go clean

# The prose gate over the reader-facing pages (STYLE-GUIDE.md). Vale runs
# where it is installed, over the page set tools/check_prose.py prints,
# so both halves read the same files; check_prose always runs, because it
# carries the house rules .vale.ini switches Google rules OFF in favour
# of -- skipping it silently would widen what is allowed.
scan-prose:
	@echo "======== scan: prose (vale + check_prose) ========"
	@if command -v vale >/dev/null 2>&1; then \
	  vale sync >/dev/null && \
	  vale --minAlertLevel=error $$(python3 tools/check_prose.py --files); \
	else \
	  echo "(vale not installed - skipping the Google/banned-list half;"; \
	  echo " see .github/workflows/docs.yml for the pinned version)"; \
	fi
	@python3 tools/check_prose.py

# RELEASING. Tagging happens IN publish.yml, never here: npm allows exactly
# one workflow file to publish, so the tags have to be written by that same
# run — and a tag must only ever exist for a release that reached the
# registry. See docs/how-to/release-and-tag.md.
#
#   make bump-go V=0.3.1     # edit go/model.go only; commit it in a PR
#   make publish             # release both halves at the versions on main
#   make publish GO=false    # npm only
#   make publish NPM=false   # Go module only
#
# Bumps are NOT automated: they land as a reviewed diff, then the release is
# a button. Nothing below commits or tags.

NPM ?= true
GO ?= true

# Set the Go module version. Edits the file and stops — commit it in a PR.
bump-go:
	@test -n "$(V)" || (echo "Usage: make bump-go V=x.y.z" && exit 1)
	# Portable in-place edit: GNU sed wants `-i`, BSD/macOS sed `-i ''`.
	# A temp file plus mv sidesteps the difference.
	sed 's/^const VERSION = ".*"/const VERSION = "$(V)"/' go/model.go > go/model.go.tmp \
		&& mv go/model.go.tmp go/model.go
	@grep -q '^const VERSION = "$(V)"' go/model.go || \
	  (echo "bump-go: failed to set VERSION in go/model.go" && exit 1)
	@echo "go/model.go now declares $(V) — commit it, then: make publish"

# Dispatch the release. Publishes what is missing, then writes both tags.
publish:
	@command -v gh >/dev/null || (echo "publish: needs the gh CLI" && exit 1)
	@test "`git rev-parse --abbrev-ref HEAD`" = "main" || \
	  (echo "publish: releases come from main" && exit 1)
	@git diff --quiet && git diff --cached --quiet || \
	  (echo "publish: working tree is dirty" && exit 1)
	git fetch origin main
	@test "`git rev-parse HEAD`" = "`git rev-parse origin/main`" || \
	  (echo "publish: local main differs from origin/main — push or pull first" && exit 1)
	gh workflow run publish.yml --ref main \
	  -f npm=$(NPM) -f go=$(GO) -f expect_sha=`git rev-parse HEAD`
	@echo "dispatched; watch: gh run list --workflow=publish.yml"

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

tags-npm:
	git tag -l 'v*' --sort=-version:refname

reset:
	cd ts && npm run reset
	cd go && go clean -cache && go build ./... && go test ./...
