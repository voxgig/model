"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
(0, node_test_1.describe)('model', () => {
    (0, node_test_1.test)('happy', () => { });
    // Node prints a runtime deprecation once per process, so each construction
    // runs in a fresh one. Node 24 is the first to deprecate fs.F_OK at runtime.
    (0, node_test_1.test)('constructing a Model on the real fs raises no deprecation', () => {
        const base = node_path_1.default.join(__dirname, '..', 'test', '_gen', 'deprecation');
        node_fs_1.default.mkdirSync(base, { recursive: true });
        const spec = { path: node_path_1.default.join(base, 'model.aontu'), base, debug: 'silent', config: false };
        const run = (0, node_child_process_1.spawnSync)(process.execPath, [
            '--throw-deprecation', '-e',
            'const { Model } = require(' + JSON.stringify(require.resolve('../dist/model')) + ')\n' +
                'new Model(' + JSON.stringify(spec) + ')',
        ]);
        node_assert_1.default.equal(run.status, 0, String(run.stderr));
    });
});
//# sourceMappingURL=model.test.js.map