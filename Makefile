.PHONY: all build test clean build-ts build-go test-ts test-go vet-go clean-ts clean-go publish-go tags-go reset

all: build test

build: build-ts build-go

test: test-ts test-go

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

# Publish the Go module: make publish-go V=0.1.1
publish-go: vet-go test-go
	@test -n "$(V)" || (echo "Usage: make publish-go V=x.y.z" && exit 1)
	sed -i '' 's/^const Version = ".*"/const Version = "$(V)"/' go/model.go
	git add go/model.go
	git commit -m "go: v$(V)"
	git tag go/v$(V)
	git push origin HEAD go/v$(V)

tags-go:
	git tag -l 'go/v*' --sort=-version:refname

reset:
	cd ts && npm run reset
	cd go && go clean -cache && go build ./... && go test ./...
