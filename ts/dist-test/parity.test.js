"use strict";
/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_fs_1 = require("node:fs");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const model_1 = require("../dist/producer/model");
// The exact bytes both implementations must emit for SRC below. Object keys
// are sorted alphabetically (a, b, html, list, nested; and a before z inside
// nested), arrays keep their order ([3,1,2]), the indent is two spaces, and
// HTML characters are written literally. The identical Go expectation lives in
// go/parity_test.go — keep the two in step.
const EXPECTED = `{
  "a": 1,
  "b": 2,
  "html": "<a> & </a>",
  "list": [
    3,
    1,
    2
  ],
  "nested": {
    "a": "a",
    "z": "z"
  }
}`;
// Source keys are deliberately out of alphabetical (insertion) order so the
// test fails if the producer ever stops sorting them.
const SRC = `b: 2
a: 1
nested: { z: "z", a: "a" }
list: [ 3, 1, 2 ]
html: "<a> & </a>"
`;
// A second fixture exercising arrays of objects: each element keeps its
// position in the array, but the keys *within* each object are sorted, as are
// the keys of nested objects. HTML characters stay literal. The identical Go
// expectation lives in go/parity_test.go — keep the two in step.
const EXPECTED2 = `{
  "alpha": 1,
  "beta": {
    "x": 1,
    "y": 2
  },
  "nums": [
    30,
    10,
    20
  ],
  "rows": [
    {
      "id": 2,
      "tag": "b<x"
    },
    {
      "id": 1,
      "tag": "a&y"
    }
  ]
}`;
const SRC2 = `beta: { y: 2, x: 1 }
alpha: 1
rows: [ { id: 2, tag: "b<x" }, { id: 1, tag: "a&y" } ]
nums: [ 30, 10, 20 ]
`;
async function buildModelJson(name, src) {
    const base = path_1.default.join(__dirname, '..', 'test', '_gen', name);
    (0, node_fs_1.mkdirSync)(base, { recursive: true });
    (0, node_fs_1.writeFileSync)(path_1.default.join(base, 'model.jsonic'), src);
    const log = (0, util_1.prettyPino)('test', {});
    const b = (0, build_1.makeBuild)({
        fs: fs_1.default,
        base,
        path: path_1.default.join(base, 'model.jsonic'),
        res: [{ path: '/', build: model_1.model_producer }],
    }, log);
    const r = await b.run({ watch: false });
    node_assert_1.default.ok(r.ok, 'build failed: ' + JSON.stringify(r.errs));
    return (0, node_fs_1.readFileSync)(path_1.default.join(base, 'model.json'), 'utf8');
}
(0, node_test_1.describe)('parity', () => {
    (0, node_test_1.test)('model-output-keys-sorted', async () => {
        node_assert_1.default.strictEqual(await buildModelJson('parity', SRC), EXPECTED);
    });
    (0, node_test_1.test)('model-output-array-of-objects', async () => {
        node_assert_1.default.strictEqual(await buildModelJson('parity2', SRC2), EXPECTED2);
    });
});
//# sourceMappingURL=parity.test.js.map