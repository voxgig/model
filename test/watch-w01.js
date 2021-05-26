

const { writeFile } = require('fs/promises')

const { Watch } = require('../dist/lib/watch')
const { Build, Spec, Val } = require('../dist/lib/build')
const { model_builder } = require('../dist/lib/builder/model')


let b0 = new Build({
  src: '@"model.jsonic"',
  base: __dirname + '/w01/model',
  res: [
    {
      path: '/',
      build: model_builder
    },
    {
      path: '/',
      build: async function gendoc(build) {
        let doc = `<html><head><title>Docs</title></head><body>
<p>FOO: ${build.model.foo}</p>
<p>BAR: ${build.model.bar}</p>
</body></html>`

        await writeFile(__dirname + '/w01/doc.html', doc)
        
        return { ok: true }
      },
    }
  ]
})

let w0 = new Watch(b0)
w0.start()

