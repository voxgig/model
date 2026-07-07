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
function silentLog() {
    return (0, util_1.prettyPino)('test', { debug: 'silent' });
}
function okResult(name) {
    return { ok: true, name, step: '', active: true, reload: false, errs: [], runlog: [] };
}
(0, node_test_1.describe)('extra', () => {
    // A producer that throws in the pre phase fails the build, and the error is
    // collected rather than escaping.
    (0, node_test_1.test)('producer-throws-in-pre', async () => {
        const dir = GEN + '/ex-pre';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu',
            res: [{
                    path: '/', build: async function boom(_build, ctx) {
                        if ('pre' === ctx.step) {
                            throw new Error('pre-boom');
                        }
                        return okResult('boom');
                    },
                }],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
        node_assert_1.default.ok(v.errs.some((e) => String(e.message ?? e).includes('pre-boom')));
    });
    // A producer that throws in the post phase fails the build.
    (0, node_test_1.test)('producer-throws-in-post', async () => {
        const dir = GEN + '/ex-post';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu',
            res: [{
                    path: '/', build: async function boom(_build, ctx) {
                        if ('post' === ctx.step) {
                            throw new Error('post-boom');
                        }
                        return okResult('boom');
                    },
                }],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
        node_assert_1.default.ok(v.errs.some((e) => String(e.message ?? e).includes('post-boom')));
    });
    // A missing root file fails the build with the read error.
    (0, node_test_1.test)('missing-root-file', async () => {
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: GEN, path: GEN + '/does-not-exist.aontu', res: [],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
        node_assert_1.default.ok(0 < v.errs.length);
    });
    // An action module may export a Promise resolving to the action function;
    // the local producer awaits it before running.
    (0, node_test_1.test)('promise-exported-action', async () => {
        const dir = GEN + '/ex-promise';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model/.model-config', { recursive: true });
        await (0, promises_1.mkdir)(dir + '/build', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/m.aontu', 'a: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.aontu', "sys: model: action: { p: load: 'build/p' }\n");
        await (0, promises_1.writeFile)(dir + '/build/p.js', "const Path = require('node:path')\n" +
            'module.exports = Promise.resolve(async function p(model, build) {\n' +
            "  const root = Path.resolve(build.path, '..', '..')\n" +
            "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
            '  return { ok: true }\n' +
            '})\n');
        const model = new model_1.Model({
            path: dir + '/model/m.aontu', base: dir + '/model', debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'build failed: ' + JSON.stringify(br.errs));
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(dir + '/p.txt', 'utf8'), 'OK');
    });
    // A producer that returns ok:false in the pre phase fails the build.
    (0, node_test_1.test)('producer-returns-not-ok-pre', async () => {
        const dir = GEN + '/ex-nokpre';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu',
            res: [{
                    path: '/', build: async function bad(_build, ctx) {
                        return {
                            ok: 'pre' !== ctx.step, name: 'bad', step: ctx.step,
                            active: true, reload: false, errs: [], runlog: [],
                        };
                    },
                }],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
    });
    // A producer that returns ok:false in the post phase fails the build.
    (0, node_test_1.test)('producer-returns-not-ok-post', async () => {
        const dir = GEN + '/ex-nokpost';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu',
            res: [{
                    path: '/', build: async function bad(_build, ctx) {
                        return {
                            ok: 'post' !== ctx.step, name: 'bad', step: ctx.step,
                            active: true, reload: false, errs: [], runlog: [],
                        };
                    },
                }],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
    });
    // With config disabled, the model builds on its own: no .model-config/ is
    // created, no actions run, but the model JSON is still written.
    (0, node_test_1.test)('config-optional-skips-config', async () => {
        const dir = GEN + '/ex-noconfig';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/m.aontu', 'a: 1\n');
        const model = new model_1.Model({
            path: dir + '/model/m.aontu', base: dir + '/model', debug: 'silent',
            config: false,
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'build failed: ' + JSON.stringify(br.errs));
        node_assert_1.default.deepStrictEqual(JSON.parse(await (0, promises_1.readFile)(dir + '/model/m.json', 'utf8')), { a: 1 });
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(dir + '/model/.model-config'), false, '.model-config should not be created when config is disabled');
    });
    // An action declared in config is ignored when config is disabled, even if a
    // .model-config file already exists.
    (0, node_test_1.test)('config-optional-ignores-existing-config', async () => {
        const dir = GEN + '/ex-noconfig-existing';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model/.model-config', { recursive: true });
        await (0, promises_1.mkdir)(dir + '/build', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/m.aontu', 'a: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.aontu', "sys: model: action: { p: load: 'build/p' }\n");
        await (0, promises_1.writeFile)(dir + '/build/p.js', "const Path = require('node:path')\n" +
            'module.exports = async function p(model, build) {\n' +
            "  const root = Path.resolve(build.path, '..', '..')\n" +
            "  build.fs.writeFileSync(Path.resolve(root, 'p.txt'), 'OK')\n" +
            '  return { ok: true }\n' +
            '}\n');
        const model = new model_1.Model({
            path: dir + '/model/m.aontu', base: dir + '/model', debug: 'silent',
            config: false,
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'build failed: ' + JSON.stringify(br.errs));
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(dir + '/p.txt'), false, 'config action should not run when config is disabled');
    });
    // An unresolved import makes aontu throw; the build collects it as an error
    // rather than letting it escape.
    (0, node_test_1.test)('unresolved-import-fails', async () => {
        const dir = GEN + '/ex-import';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'top: @"./missing.aontu"\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu', res: [],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
        node_assert_1.default.ok(0 < v.errs.length);
    });
});
//# sourceMappingURL=extra.test.js.map