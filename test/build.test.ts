/* Copyright (c) 2021-2022 Richard Rodger and other contributors, MIT License */

import { writeFile, readFile } from 'fs/promises'


import { Model } from '../model'
import { Build } from '../lib/build'
import { model_builder } from '../lib/builder/model'


describe('build', () => {

  test('project-p01', async () => {
    await writeFile(__dirname + '/p01/doc.html', 'BAD')

    let b0 = new Build({
      src: '@"model.jsonic"',
      base: __dirname + '/p01/model',
      path: __dirname + '/p01/model/model.json',
      res: [
        {
          path: '/',
          build: async function test(build: Build) {
            // console.log('RES:/', build.root.canon, build.model)
            expect(build.root.canon).toEqual('{"foo":1,"bar":2}')
            expect(build.model).toEqual({ foo: 1, bar: 2 })
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

    let v0 = await b0.run()

    expect(v0.ok).toEqual(true)
    expect(b0.root.canon).toEqual('{"foo":1,"bar":2}')
    expect(await readFile(__dirname + '/p01/doc.html', { encoding: 'utf8' }))
      .toEqual(`<html><head><title>Docs</title></head><body>
<p>FOO: 1</p>
<p>BAR: 2</p>
</body></html>`)
  })


  test('project-sys01', async () => {
    await writeFile(__dirname + '/sys01/foo.txt', 'BAD')
    await writeFile(__dirname + '/sys01/model/model.json', 'BAD')
    await writeFile(__dirname + '/sys01/model/.model-config/model-config.json', 'BAD')

    let base = __dirname + '/sys01/model'
    await writeFile(base + '/model.json', 'BAD')
    let path = base + '/model.jsonic'
    let src = await readFile(base + '/model.jsonic', { encoding: 'utf8' })

    let model = new Model({
      src,
      path,
      base,
    })
    let br = await model.run()

    expect(br.ok)

    expect(await readFile(base + '/model.json', { encoding: 'utf8' }))
      .toEqual(JSON.stringify(SYS_MODEL, undefined, 2))

    expect(await readFile(base + '/.model-config/model-config.json',
      { encoding: 'utf8' }))
      .toEqual(JSON.stringify(CONFIG_MODEL, undefined, 2))

    expect(await readFile(__dirname + '/sys01/foo.txt', { encoding: 'utf8' }))
      .toEqual('FOO')
  })


})





const SYS_MODEL =
{
  "sys": {
    "shape": {
      "srv": {
        "in": {},
        "deps": {},
        "api": {
          "web": {
            "active": true,
            "path": {
              "prefix": "/",
              "area": "",
              "suffix": "",
            },
            "method": "POST",
            "cors": {
              "active": false
            }
          }
        },
        "env": {
          "lambda": {
            "active": false,
            "timeout": 30,
            "handler": {
              "path": {
                "prefix": "src/",
                "suffix": ".handler"
              }
            }
          }
        }
      },
      "app": {},
      "part": {
        "img": {}
      }
    },
    // "app": {
    //   "web": {
    //     "basic": {
    //       "name": "basic",
    //       "layout": "BasicAdmin",
    //       "parts": {
    //         "head": {
    //           "part": "BasicHead"
    //         },
    //         "side": {
    //           "part": "BasicSide"
    //         },
    //         "main": {
    //           "part": "BasicMain"
    //         },
    //         "foot": {
    //           "part": "BasicFoot"
    //         }
    //       }
    //     }
    //   }
    // }
  },
  "main": {
    "srv": {
      "foo": {
        "in": {},
        "deps": {},
        "api": {
          "web": {
            "active": true,
            "path": {
              "prefix": "/",
              "area": "",
              "suffix": "",
            },
            "method": "POST",
            "cors": {
              "active": false
            }
          }
        },
        "env": {
          "lambda": {
            "active": false,
            "timeout": 30,
            "handler": {
              "path": {
                "prefix": "src/",
                "suffix": ".handler"
              }
            }
          }
        }
      },
      "bar": {
        "env": {
          "lambda": {
            "active": true,
            "timeout": 30,
            "handler": {
              "path": {
                "prefix": "src/",
                "suffix": ".handler"
              }
            }
          }
        },
        "in": {},
        "deps": {},
        "api": {
          "web": {
            "active": true,
            "path": {
              "prefix": "/",
              "area": "",
              "suffix": "",
            },
            "method": "POST",
            "cors": {
              "active": false
            }
          }
        }
      }
    }
  }
}


const CONFIG_MODEL = {
  "sys": {
    "model": {
      "builders": {
        "foo": {
          "load": "build/foo"
        }
      }
    }
  }
}
