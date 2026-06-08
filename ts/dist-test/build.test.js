"use strict";
/* Copyright (c) 2021-2024 Richard Rodger and other contributors, MIT License */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const promises_1 = require("node:fs/promises");
const node_fs_1 = require("node:fs");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const model_1 = require("../dist/model");
const model_2 = require("../dist/producer/model");
(0, node_test_1.describe)('build', () => {
    (0, node_test_1.test)('project-p01', async () => {
        await (0, promises_1.writeFile)(__dirname + '/../test/p01/doc.html', 'BAD');
        let log = (0, util_1.prettyPino)('test', {});
        let b0 = (0, build_1.makeBuild)({
            fs: fs_1.default,
            base: __dirname + '/../test/p01/model',
            path: __dirname + '/../test/p01/model/model.jsonic',
            res: [
                {
                    path: '/',
                    build: async function test(build, ctx) {
                        if ('post' === ctx.step) {
                            node_assert_1.default.deepStrictEqual(build.model, { foo: 1, bar: 2 });
                        }
                        return { ok: true, step: '', name: 'test', active: true, reload: false, errs: [], runlog: [] };
                    },
                },
                {
                    path: '/',
                    build: model_2.model_producer
                },
                {
                    path: '/',
                    build: async function gendoc(build, ctx) {
                        if ('post' === ctx.step) {
                            let doc = `<html><head><title>Docs</title></head><body>
<p>FOO: ${build.model.foo}</p>
<p>BAR: ${build.model.bar}</p>
</body></html>`;
                            await (0, promises_1.writeFile)(__dirname + '/../test/p01/doc.html', doc);
                        }
                        return {
                            ok: true, name: 'gendoc', step: '',
                            active: true, reload: false, errs: [], runlog: []
                        };
                    },
                }
            ]
        }, log);
        let v0 = await b0.run({ watch: false });
        node_assert_1.default.strictEqual(v0.ok, true);
        node_assert_1.default.deepStrictEqual(b0.model, { "foo": 1, "bar": 2 });
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(__dirname + '/../test/p01/doc.html', { encoding: 'utf8' }), `<html><head><title>Docs</title></head><body>
<p>FOO: 1</p>
<p>BAR: 2</p>
</body></html>`);
    });
    (0, node_test_1.test)('project-sys01', async () => {
        const folder = __dirname + '/../test/sys01/';
        await (0, promises_1.writeFile)(folder + 'foo.txt', 'BAD');
        await (0, promises_1.writeFile)(folder + 'pre.txt', 'BAD');
        await (0, promises_1.writeFile)(folder + 'model/pre.jsonic', 'BAD');
        await (0, promises_1.writeFile)(folder + 'model/model.json', 'BAD');
        await (0, promises_1.writeFile)(folder + 'model/.model-config/model-config.json', 'BAD');
        let base = __dirname + '/../test/sys01/model';
        await (0, promises_1.writeFile)(base + '/model.json', 'BAD');
        let path = base + '/model.jsonic';
        let model = new model_1.Model({
            path,
            base,
            dryrun: true
        });
        let br = await model.run();
        node_assert_1.default.ok(br.ok);
        node_assert_1.default.strictEqual((0, node_fs_1.readFileSync)(folder + 'foo.txt').toString(), 'BAD');
        node_assert_1.default.strictEqual((0, node_fs_1.readFileSync)(folder + 'pre.txt').toString(), 'BAD');
        node_assert_1.default.strictEqual((0, node_fs_1.readFileSync)(folder + 'model/pre.jsonic').toString(), 'BAD');
        node_assert_1.default.strictEqual((0, node_fs_1.readFileSync)(folder + 'model/model.json').toString(), 'BAD');
        node_assert_1.default.strictEqual((0, node_fs_1.readFileSync)(folder + 'model/.model-config/model-config.json').toString(), 'BAD');
        model = new model_1.Model({
            path,
            base,
            buildargs: {
                pre: {
                    bar: 'BAR'
                }
            }
        });
        br = await model.run();
        node_assert_1.default.ok(br.ok);
        let model_json = await (0, promises_1.readFile)(base + '/model.json', { encoding: 'utf8' });
        node_assert_1.default.deepStrictEqual(JSON.parse(model_json), SYS_MODEL);
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(base + '/.model-config/model-config.json', { encoding: 'utf8' }), JSON.stringify(CONFIG_MODEL, undefined, 2));
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(__dirname + '/../test/sys01/foo.txt', { encoding: 'utf8' }), 'FOO:OK');
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(__dirname + '/../test/sys01/pre.txt', { encoding: 'utf8' }), 'PRE:BAR');
    });
});
const SYS_MODEL = {
    "pre": "OK",
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
    /*
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
    */
    }
};
const CONFIG_MODEL = {
    "sys": {
        "model": {
            "action": {
                "foo": {
                    "load": "build/foo"
                },
                "pre": {
                    "load": "build/pre"
                }
            },
            "order": {
                "action": "pre,foo"
            }
        }
    }
};
//# sourceMappingURL=build.test.js.map