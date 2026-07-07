# Tutorial: your first model

This walkthrough takes you from an empty folder to a working model that
generates a file, with live rebuilds. It assumes only that you can run `node`
and `npm`. Follow it top to bottom — each step builds on the last.

By the end you will have:

- written a model in `.aontu`,
- unified it into a single JSON document,
- generated an artifact from it with an action,
- and watched it all rebuild on save.

> New to the ideas here? You can do the tutorial first and read the
> [explanation](./explanation.md) afterwards — the concepts will land better
> once you have seen them work.


## 1. Set up a project

```bash
mkdir hello-model && cd hello-model
npm init -y
npm install @voxgig/model pino
```

`pino` is a peer dependency used for logging. Installing it now avoids a warning
later.

Create the conventional layout:

```bash
mkdir -p model build
```


## 2. Write a model

Create `model/model.aontu`:

```jsonic
# model/model.aontu
service: name: 'orders'
service: port: 8080
```

Build it once:

```bash
npx voxgig-model model/model.aontu
```

You will see a few log lines, and a new file `model/model.json`:

```json
{
  "service": {
    "name": "orders",
    "port": 8080
  }
}
```

That is the whole job of the core tool: take your `.aontu` source, **unify** it,
and write the result as a single canonical JSON model. Everything else builds on
that model.


## 3. Add structure with types and defaults

The point of a modeling language is to capture rules, not just values. Replace
`model/model.aontu` with:

```jsonic
# model/model.aontu

# A reusable "shape" for a service: defaults plus type constraints.
shape: service: {
  name?: string              # optional in the shape; each service supplies it
  port: *8080 | integer      # default 8080, but must be an integer
  public: *false | boolean   # default false
}

# Two services, each built from the shape.
service: orders:  $.shape.service & { name: 'orders' }
service: web:     $.shape.service & { name: 'web', public: true, port: 443 }
```

Rebuild:

```bash
npx voxgig-model model/model.aontu
```

`model/model.json` now contains:

```json
{
  "shape": { "service": { "port": 8080, "public": false } },
  "service": {
    "orders": { "name": "orders", "port": 8080, "public": false },
    "web":    { "name": "web",    "port": 443,  "public": true }
  }
}
```

Notice what happened:

- `orders` inherited the default `port: 8080` and `public: false`.
- `web` overrode both. The override **unifies** with the shape — if you tried
  `port: 'https'` it would fail, because `port` must be an `integer`.

`$.shape.service` is an **absolute reference** (from the model root) and `&`
**unifies** it with the per-service overrides. This is how you keep one source
of truth for structure and reuse it everywhere.

> Why is `name` optional (`name?`)? The shape itself appears in the output, and
> every field in the generated model must resolve to a concrete value. A bare
> `name: string` with nothing to satisfy it would fail to generate — so the
> shape leaves `name` optional (it may be absent) and each concrete service
> supplies its own.


## 4. Split the model across files

Real models grow. Move the shape into its own file.

`model/shapes.aontu`:

```jsonic
# model/shapes.aontu
shape: service: {
  name?: string
  port: *8080 | integer
  public: *false | boolean
}
```

`model/model.aontu`:

```jsonic
# model/model.aontu
@"./shapes.aontu"

service: orders: $.shape.service & { name: 'orders' }
service: web:    $.shape.service & { name: 'web', public: true, port: 443 }
```

Rebuild — the output is identical. `@"./shapes.aontu"` **imports** the file and
unifies it into the model. Imports are tracked as dependencies, which matters in
step 6.


## 5. Generate something with an action

A model is only useful if it drives output. An **action** is a small JS module
that receives the unified model and produces an artifact.

First, declare the action in the config file
`model/.model-config/model-config.aontu`:

```jsonic
# model/.model-config/model-config.aontu
sys: model: action: {
  envFile: load: 'build/envFile'
}
```

The `load` path is relative to the **project root** (the folder above `model/`)
and has no extension, so this points at `build/envFile.js`. (Action names are
plain identifiers — use `envFile`, not `env-file`; a hyphen would need quoting.)

Now write the action, `build/envFile.js`:

```js
// build/envFile.js
const Path = require('node:path')

module.exports = async function envFile(model, build) {
  // project root is two levels up from the model root file
  const root = Path.resolve(build.path, '..', '..')

  const lines = Object.entries(model.service).map(
    ([name, svc]) => `# ${name}\nPORT_${name.toUpperCase()}=${svc.port}`
  )

  build.fs.writeFileSync(
    Path.resolve(root, 'services.env'),
    lines.join('\n') + '\n'
  )

  return { ok: true }
}
```

Build again:

```bash
npx voxgig-model model/model.aontu
```

You now have a generated `services.env`:

```
# orders
PORT_ORDERS=8080
# web
PORT_WEB=443
```

Using `build.fs` (rather than `require('fs')` directly) means your action
automatically respects `--dryrun`.


## 6. Watch and iterate

Generating on demand is fine; generating as you type is better. Start watch
mode:

```bash
npx voxgig-model --watch model/model.aontu
```

Leave it running. In another terminal (or your editor), change a value — set
`orders` to `port: 9090` in `model/model.aontu`, or edit `model/shapes.aontu`.
Within a moment the tool rebuilds and `services.env` updates. Editing the
imported `shapes.aontu` works too, because imports are tracked dependencies.

Press `Ctrl-C` to stop.


## 7. Try a dry run

Before wiring a model into anything destructive, preview it without writing
files:

```bash
npx voxgig-model --dryrun model/model.aontu
```

The build runs exactly as normal — actions execute, the model resolves — but
every write is redirected to an in-memory filesystem. Nothing on disk changes.


## What you learned

- A model is `.aontu` source unified into one JSON document.
- **Types** (`integer`, `string`, …) and **defaults** (`*value | type`) let the
  model enforce its own rules.
- **References** (`$.path`) and **unification** (`&`) reuse structure.
- **Imports** (`@"./file"`) split a model across files.
- **Actions** turn the model into artifacts, and respect `--dryrun` via
  `build.fs`.
- **Watch mode** rebuilds on every change, including changes to imports.


## Where to next

- [How-to guides](./how-to.md) — focused recipes (build args, custom producers,
  embedding the API, in-memory filesystems, and more).
- [Reference](./reference.md) — every CLI flag, config key, API type, and
  language construct.
- [Explanation](./explanation.md) — why unification, how the build lifecycle and
  watcher actually work, and the current limitations.
