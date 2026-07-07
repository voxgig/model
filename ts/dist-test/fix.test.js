"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = require("node:fs/promises");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const model_1 = require("../dist/model");
const GEN = __dirname + '/../test/_gen';
(0, node_test_1.describe)('fix', () => {
    // A model failure must not stick to later builds. The BuildImpl is reused
    // across watch rebuilds, so its error state has to reset every run. This
    // also exercises that aontu errors are collected (not thrown) into errs.
    (0, node_test_1.test)('recovers-from-model-error', async () => {
        const dir = GEN + '/err01';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const path = dir + '/model.aontu';
        const log = (0, util_1.prettyPino)('test', {});
        // Conflicting scalar values do not unify -> a collected model error.
        await (0, promises_1.writeFile)(path, 'x: 1\nx: 2\n');
        const b = (0, build_1.makeBuild)({ fs: node_fs_1.default, base: dir, path, res: [] }, log);
        const bad = await b.run({ watch: false });
        node_assert_1.default.strictEqual(bad.ok, false, 'invalid model should fail');
        node_assert_1.default.ok(0 < bad.errs.length, 'invalid model should report errors');
        // Repair the model and rebuild on the SAME instance.
        await (0, promises_1.writeFile)(path, 'x: 1\n');
        const good = await b.run({ watch: false });
        node_assert_1.default.strictEqual(good.ok, true, 'build should recover after repair');
        node_assert_1.default.strictEqual(good.errs.length, 0, 'errors must not leak across runs');
        node_assert_1.default.deepStrictEqual(b.model, { x: 1 });
    });
    // An order entry that names an undefined action should fail with a clear
    // message rather than an opaque "cannot read properties of undefined".
    (0, node_test_1.test)('clear-error-on-unknown-action', async () => {
        const dir = GEN + '/act01';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model/.model-config', { recursive: true });
        await (0, promises_1.mkdir)(dir + '/build', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'top: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.aontu', "sys: model: action: { real: load: 'build/real' }\n" +
            "sys: model: order: action: 'real,ghost'\n");
        await (0, promises_1.writeFile)(dir + '/build/real.js', 'module.exports = async () => ({ ok: true })\n');
        const model = new model_1.Model({
            path: dir + '/model/model.aontu',
            base: dir + '/model',
            // The build deliberately errors; silence the expected log noise.
            debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.strictEqual(br.ok, false, 'unknown action should fail the build');
        const msg = String(br.errs[0]?.message ?? br.errs[0] ?? '');
        node_assert_1.default.match(msg, /Unknown model action "ghost"/);
    });
    // An action definition with no load path should also fail clearly.
    (0, node_test_1.test)('clear-error-on-missing-load', async () => {
        const dir = GEN + '/act02';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model/.model-config', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'top: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.aontu', 'sys: model: action: { noload: {} }\n' +
            "sys: model: order: action: 'noload'\n");
        const model = new model_1.Model({
            path: dir + '/model/model.aontu',
            base: dir + '/model',
            debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.strictEqual(br.ok, false, 'action without load should fail');
        const msg = String(br.errs[0]?.message ?? br.errs[0] ?? '');
        node_assert_1.default.match(msg, /Model action "noload" is missing a "load" path/);
    });
    // An action that throws at run time must fail the build and surface the
    // error rather than silently passing.
    (0, node_test_1.test)('action-error-fails-build', async () => {
        const dir = GEN + '/throw01';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model/.model-config', { recursive: true });
        await (0, promises_1.mkdir)(dir + '/build', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'top: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.aontu', "sys: model: action: { boom: load: 'build/boom' }\n");
        await (0, promises_1.writeFile)(dir + '/build/boom.js', "module.exports = async () => { throw new Error('boom-action') }\n");
        const model = new model_1.Model({
            path: dir + '/model/model.aontu',
            base: dir + '/model',
            debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.strictEqual(br.ok, false, 'a throwing action should fail the build');
        const msg = String(br.errs[0]?.message ?? br.errs[0] ?? '');
        node_assert_1.default.match(msg, /boom-action/);
    });
    // dryrun must not write to the real filesystem, including via the
    // promise-based fs API.
    (0, node_test_1.test)('dryrun-readonly-promises', async () => {
        const dir = GEN + '/dry01';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const model = new model_1.Model({
            path: dir + '/model.aontu',
            base: dir,
            dryrun: true,
        });
        // Parent dir (cwd) exists in the dryrun in-memory volume.
        const target = process.cwd() + '/.dryrun-probe-' + Date.now() + '.tmp';
        try {
            await model.fs.promises.writeFile(target, 'NOPE');
        }
        catch {
            // A rejection is also acceptable: nothing reached the real disk.
        }
        const onDisk = node_fs_1.default.existsSync(target);
        if (onDisk) {
            node_fs_1.default.unlinkSync(target);
        }
        node_assert_1.default.strictEqual(onDisk, false, 'dryrun promises.writeFile must not touch the real filesystem');
    });
});
//# sourceMappingURL=fix.test.js.map