/* Copyright (c) 2021 Richard Rodger and other contributors, MIT License */

import { writeFile } from 'fs/promises'

import Lab from '@hapi/lab'
import Code from '@hapi/code'


const lab = (exports.lab = Lab.script())
const describe = lab.describe
const it = lab.it
const expect = Code.expect



import { Build, Spec, Val } from '../lib/build'
import { model_builder } from '../lib/builder/model'


describe('build', () => {

  it('project-p01', async () => {
    let b0 = new Build({
      src: '@"model.jsonic"',
      base: __dirname + '/p01/model',
      res: [
        {
          path: '/',
          build: async function test(build: Build) {
            console.log('RES:/', build.root.canon, build.model)
            expect(build.root.canon).equal('{"foo":1,"bar":2}')
            expect(build.model).equal({ foo: 1, bar: 2 })
            return { ok: true }
          },
        },
        {
          path: '/',
          build: model_builder
        },
        {
          path: '/',
          build: async function gendoc(build: Build) {
            let doc = `<html><head><title>Docs</title></head><body>
<p>FOO: ${build.model.foo}</p>
<p>BAR: ${build.model.bar}</p>
</body></html>`

            await writeFile(__dirname + '/p01/doc.html', doc)

            return { ok: true }
          },
        }
      ]
    })
    // console.log(b0)

    let v0 = await b0.run()
    //console.log(v0.canon)
    expect(v0.ok).true()
    expect(b0.root.canon).equal('{"foo":1,"bar":2}')
  })

})
