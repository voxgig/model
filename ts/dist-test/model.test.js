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
const model_1 = require("../dist/model");
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
    const ACCESS_MODES = ['F_OK', 'R_OK', 'W_OK', 'X_OK'];
    function accessModeModel(fs) {
        const base = node_path_1.default.join(__dirname, '..', 'test', '_gen', 'access-modes');
        node_fs_1.default.mkdirSync(base, { recursive: true });
        return new model_1.Model({ path: node_path_1.default.join(base, 'model.aontu'), base, debug: 'silent', config: false, fs });
    }
    (0, node_test_1.test)('the fs a Model hands its build keeps the access modes', () => {
        const buildFs = accessModeModel().build.fs;
        for (const mode of ACCESS_MODES) {
            node_assert_1.default.equal(buildFs[mode], node_fs_1.default.constants[mode], mode);
        }
    });
    // The shape a Node fs has once the access modes are deprecated at runtime,
    // built by hand so every Node version runs it.
    (0, node_test_1.test)('an fs whose access modes are hidden getters gets them from its constants', () => {
        const hidden = { ...node_fs_1.default };
        for (const mode of ACCESS_MODES) {
            delete hidden[mode];
            Object.defineProperty(hidden, mode, {
                enumerable: false,
                get: () => { throw new Error(mode + ' getter read'); },
            });
        }
        const buildFs = accessModeModel(hidden).build.fs;
        for (const mode of ACCESS_MODES) {
            node_assert_1.default.equal(buildFs[mode], node_fs_1.default.constants[mode], mode);
        }
    });
});
//# sourceMappingURL=model.test.js.map