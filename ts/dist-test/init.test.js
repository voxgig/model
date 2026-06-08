"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = require("node:fs/promises");
const node_child_process_1 = require("node:child_process");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const model_1 = require("../dist/model");
const GEN = __dirname + '/../test/_gen';
const BIN = __dirname + '/../bin/voxgig-model';
(0, node_test_1.describe)('init', () => {
    (0, node_test_1.test)('scaffolds-and-skips-existing', async () => {
        const dir = GEN + '/init01';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        const r1 = (0, model_1.initModel)(dir, node_fs_1.default);
        node_assert_1.default.strictEqual(r1.created.length, 2);
        node_assert_1.default.strictEqual(r1.skipped.length, 0);
        await (0, promises_1.stat)(dir + '/model/model.jsonic');
        await (0, promises_1.stat)(dir + '/model/.model-config/model-config.jsonic');
        // Second run leaves existing files untouched.
        const r2 = (0, model_1.initModel)(dir, node_fs_1.default);
        node_assert_1.default.strictEqual(r2.created.length, 0);
        node_assert_1.default.strictEqual(r2.skipped.length, 2);
    });
    (0, node_test_1.test)('scaffold-builds', async () => {
        const dir = GEN + '/init02';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        (0, model_1.initModel)(dir, node_fs_1.default);
        const model = new model_1.Model({
            path: dir + '/model/model.jsonic', base: dir + '/model', debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'scaffolded model failed: ' + JSON.stringify(br.errs));
    });
    (0, node_test_1.test)('cli-init', async () => {
        const dir = GEN + '/init03';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN, 'init', dir], { encoding: 'utf8' });
        node_assert_1.default.strictEqual(res.status, 0, res.stderr);
        node_assert_1.default.ok(res.stdout.includes('created:'), res.stdout);
        await (0, promises_1.stat)(dir + '/model/model.jsonic');
    });
});
//# sourceMappingURL=init.test.js.map