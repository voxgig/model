# @voxgig/model

A framework for **universal application modeling**: describe a system once as a
single declarative model, then generate every downstream artifact — code,
configuration, documentation, infrastructure — from that one source of truth.

The core tool unifies `.aon` source (using [CUE](https://cuelang.org)-style
unification, via [aontu](https://github.com/voxgig/aontu)) into one canonical
JSON model, then hands that model to your generators ("actions"). It can build
once or watch and rebuild on change.

> **Status: prototype.** The concepts are stable; specific APIs and conventions
> may still change. Inspired by [CUE](https://cuelang.org).


## Install

The TypeScript package (npm):

```bash
npm install @voxgig/model pino
```

`pino` is a peer dependency (logging). Requires Node.js — CI runs Node 24;
Node 20.19+ generally works.

The Go module:

```bash
go get github.com/voxgig/model/go
```

Both implementations live in this repository — `ts/` (TypeScript, canonical)
and `go/` (Go, kept in parity). See [go/README.md](./go/README.md) for Go usage.
TypeScript is canonical: change it first, with a test, then mirror the change
in Go. Behaviour that a source compiles to (aontu in, `model.json` bytes out)
is a row in the shared [`test/spec/*.tsv`](./test/spec) fixtures, which both
suites run; an error case, or a value only a producer can introduce, is a
mirrored per-language test instead.


## Quick start

```bash
# 1. a model
mkdir -p model && cat > model/model.aon <<'EOF'
service: name: 'orders'
service: port: *8080 | integer
EOF

# 2. build it -> writes model/model.json
npx voxgig-model model/model.aon

# 3. or watch and rebuild on change
npx voxgig-model --watch model/model.aon
```

`model/model.json`:

```json
{ "service": { "name": "orders", "port": 8080 } }
```

Use it from code instead of the CLI:

```js
const { Model } = require('@voxgig/model')

const model = new Model({ path: 'model/model.aon', base: 'model' })
const result = await model.run()
if (!result.ok) throw new Error(result.errs.join('; '))
```


## What it does

- **Unifies** `.aon` source — with types, defaults, references, wildcards,
  and imports — into a single validated JSON model.
- **Generates** artifacts from that model through **actions**: small JS modules
  you declare in config and that receive the unified model.
- **Watches** source and config files and rebuilds incrementally, tracking
  imports as dependencies.
- **Previews** safely with `--dryrun` (writes redirected to an in-memory
  filesystem), and can build against any `fs` implementation.


## Documentation

| If you want to… | Read |
|------------------|------|
| Learn by building a model step by step | [Tutorial](./docs/tutorial.md) |
| Accomplish a specific task | [How-to guides](./docs/how-to.md) |
| Look up a flag, type, config key, or language construct | [Reference](./docs/reference.md) |
| Understand how and why it works | [Explanation](./docs/explanation.md) |

Working **on** this repository? From the root, `make build` and `make test`
drive both languages. The TypeScript build output in `ts/dist/` is committed,
so rebuild it with any source change, and the documentation follows
[the style guide](./STYLE-GUIDE.md).


## A fuller example

A model that generates an environment file from its services:

```
my-project/
├─ model/
│  ├─ model.aon
│  └─ .model-config/model-config.aon
└─ build/envFile.js
```

```jsonic
# model/model.aon
shape: service: { name?: string, port: *8080 | integer }
service: orders: $.shape.service & { name: 'orders' }
service: web:    $.shape.service & { name: 'web', port: 443 }
```

```jsonic
# model/.model-config/model-config.aon
sys: model: action: { envFile: load: 'build/envFile' }
```

```js
// build/envFile.js
const Path = require('node:path')
module.exports = async function envFile(model, build) {
  const root = Path.resolve(build.path, '..', '..')
  const lines = Object.entries(model.service)
    .map(([n, s]) => `PORT_${n.toUpperCase()}=${s.port}`)
  build.fs.writeFileSync(Path.resolve(root, 'services.env'), lines.join('\n') + '\n')
  return { ok: true }
}
```

```bash
npx voxgig-model model/model.aon   # writes model/model.json and services.env
```

See the [tutorial](./docs/tutorial.md) for the same example built up from
scratch.


## License

MIT © Voxgig Ltd. See [LICENSE](./LICENSE).
