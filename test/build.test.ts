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

    let model_json = await readFile(base + '/model.json', { encoding: 'utf8' })

    expect(JSON.parse(model_json))
      // .toEqual(JSON.stringify(SYS_MODEL, undefined, 2))
      .toEqual(SYS_MODEL)

    expect(await readFile(base + '/.model-config/model-config.json',
      { encoding: 'utf8' }))
      .toEqual(JSON.stringify(CONFIG_MODEL, undefined, 2))

    expect(await readFile(__dirname + '/sys01/foo.txt', { encoding: 'utf8' }))
      .toEqual('FOO')
  })


})





const SYS_MODEL =
{
  "color": {
    "blue": {
      "name": "blue",
      "value": "00f",
    },
    "green": {
      "name": "green",
      "value": "0f0",
    },
    "red": {
      "name": "red",
      "value": "f00",
    },
  },
  "main": {
    "srv": {
      "foo": {
        "env": {
          "lambda": {
            "handler": {
              "path": {
                "prefix": "src/handler/lambda/",
                "suffix": ".handler"
              }
            },
            "active": false,
            "timeout": 30,
            "kind": "standard"
          }
        },
        "api": {
          "web": {
            "active": true,
            "method": "POST",
            "cors": {
              "active": false
            },
            "path": {
              "prefix": "/api/"
            }
          }
        },
        "in": {},
        "out": {},
        "deps": {}
      },
      "bar": {
        "env": {
          "lambda": {
            "handler": {
              "path": {
                "prefix": "src/handler/lambda/",
                "suffix": ".handler"
              }
            },
            "active": true,
            "timeout": 30,
            "kind": "standard"
          }
        },
        "api": {
          "web": {
            "active": true,
            "method": "POST",
            "cors": {
              "active": false
            },
            "path": {
              "prefix": "/api/"
            }
          }
        },
        "in": {},
        "out": {},
        "deps": {}
      }
    },
  },
  "sys": {
    "shape": {
      "srv": {
        "base": {
          "in": {},
          "out": {},
          "deps": {},
          "api": {
            "web": {
              "path": {},
              "cors": {}
            }
          },
          "env": {
            "lambda": {
              "handler": {
                "path": {}
              }
            }
          }
        },
        "std": {
          "api": {
            "web": {
              "active": true,
              "method": "POST",
              "cors": {
                "active": false
              },
              "path": {
                "prefix": "/api/"
              }
            }
          },
          "env": {
            "lambda": {
              "active": false,
              "timeout": 30,
              "handler": {
                "path": {
                  "suffix": ".handler"
                }
              },
              "kind": "standard"
            }
          },
          "in": {},
          "out": {},
          "deps": {}
        },
        "std_js": {
          "env": {
            "lambda": {
              "handler": {
                "path": {
                  "prefix": "src/handler/lambda/",
                  "suffix": ".handler"
                }
              },
              "active": false,
              "timeout": 30,
              "kind": "standard"
            }
          },
          "api": {
            "web": {
              "active": true,
              "method": "POST",
              "cors": {
                "active": false
              },
              "path": {
                "prefix": "/api/"
              }
            }
          },
          "in": {},
          "out": {},
          "deps": {}
        },
        "std_ts": {
          "env": {
            "lambda": {
              "handler": {
                "path": {
                  "prefix": "dist/handler/lambda/",
                  "suffix": ".handler"
                }
              },
              "active": false,
              "timeout": 30,
              "kind": "standard"
            }
          },
          "api": {
            "web": {
              "active": true,
              "method": "POST",
              "cors": {
                "active": false
              },
              "path": {
                "prefix": "/api/"
              }
            }
          },
          "in": {},
          "out": {},
          "deps": {}
        }
      },
      "app": {},
      "ent": {
        "field": {
          "id": {
            "active": true,
            "dx": {},
            "kind": "Text",
            "ux": {},
          },
        },
        "id": {
          "field": "id",
        },
      }, "part": {
        "img": {}
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
