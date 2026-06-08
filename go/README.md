# @voxgig/model (Go)

A Go port of [@voxgig/model](https://github.com/voxgig/model): unify `.jsonic`
source into a single model (via [aontu](https://github.com/rjrodger/aontu)) and
run generator "actions" over it, once or in a rebuild-on-change watch loop. The
TypeScript implementation in [`../ts`](../ts) is canonical; this module is kept
in architectural parity.

```bash
go get github.com/voxgig/model/go
```

## Usage

```go
package main

import (
	"fmt"

	model "github.com/voxgig/model/go"
)

func main() {
	m := model.New(model.ModelSpec{
		Path: "model/model.jsonic",
		Base: "model",
		Actions: map[string]model.ActionDef{
			"summary": {Run: func(mod map[string]any, b *model.Build, ctx *model.BuildContext) model.ActionResult {
				fmt.Printf("model has %d top-level keys\n", len(mod))
				return model.ActionResult{OK: true}
			}},
		},
	})

	br := m.Run() // or m.Start() to watch, then m.Stop()
	if !br.OK {
		for _, e := range br.Errs {
			fmt.Println("ERROR:", e)
		}
	}
}
```

`model.New(...).Run()` resolves the model (applying aontu defaults, types and
`@"..."` imports), writes `<base>/<name>.json`, then runs the registered
actions whose step matches each build phase.

## Differences from the TypeScript version

This port mirrors the architecture — the build lifecycle (pre → reload →
post), producers, dryrun, and watch semantics — but adapts a few mechanisms to
Go:

- **Actions are registered programmatically** (`ModelSpec.Actions`): the
  `.model-config/model-config.jsonic` file still declares which actions run and
  in what order (and is auto-created and written to `model-config.json`, as in
  TypeScript), but Go binds each declared name to a registered func rather than
  `require()`-ing a module.
- **Watching polls modification times** instead of using chokidar.
- **Imports** resolve relative to the model base directory; the resolver
  briefly changes the working directory because the Go aontu `Generate(src)`
  API takes no base parameter.
- **JSON object keys are emitted in sorted order** (Go's `encoding/json`),
  where TypeScript preserves insertion order. The content is otherwise the
  same.

## CLI

```bash
go run github.com/voxgig/model/go/cmd/voxgig-model -w model/model.jsonic
```

Flags: `-w` watch, `-y` dryrun, `-g <level>` log level. The CLI writes the
model JSON; for custom actions, embed the package and register them.
