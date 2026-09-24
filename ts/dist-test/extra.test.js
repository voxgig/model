"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const model_1 = require("../dist/model");
const model_2 = require("../dist/producer/model");
const config_1 = require("../dist/config");
const GEN = __dirname + '/../test/_gen';
function silentLog() {
    return (0, util_1.prettyPino)('test', { debug: 'silent' });
}
function okResult(name) {
    return { ok: true, name, step: '', active: true, reload: false, errs: [], runlog: [] };
}
const LEGACY_CONFIG = `
@'@voxgig/model/model/.model-config/model-config.aon'
@ "./local.aon"

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aon'
# @"./retired.aon"
`;
const MIGRATED_CONFIG = `
@'@voxgig/model/model/.model-config/model-config.aontu'
@ "./local.aontu"

sys: model: action: {}
sys: model: was: '@voxgig/model/model/.model-config/model-config.aon'
# @"./retired.aon"
`;
// aontu errors carry circular Val graphs, so JSON.stringify(errs) throws
// ERR_TEST_FAILURE on the message rather than reporting the real failure.
function errtext(errs) {
    return (errs || []).map((e) => e && (e.msg || e.message) || String(e)).join(' | ');
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
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
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
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
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
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(dir + '/p.txt'), false, 'config action should not run when config is disabled');
    });
    // An unresolved import makes aontu throw; the build collects it as an error
    // rather than letting it escape.
    // Aontu comments are `#` only: makeBuild disables the jsonic defaults for
    // `//` and `/* */` so the npm engine matches the Go parser. The equivalent
    // Go test is TestCommentHashOnly in go/extra_test.go.
    (0, node_test_1.test)('comment-hash-only', async () => {
        const cases = [
            ['hash', '# note\na: 1\n', true],
            ['slash', 'a: 1 // nope\n', false],
            ['multi', 'a: /* nope */ 1\n', false],
        ];
        for (const [name, src, ok] of cases) {
            const dir = GEN + '/ex-comment-' + name;
            await (0, promises_1.rm)(dir, { recursive: true, force: true });
            await (0, promises_1.mkdir)(dir, { recursive: true });
            await (0, promises_1.writeFile)(dir + '/m.aontu', src);
            const b = (0, build_1.makeBuild)({
                fs: node_fs_1.default, base: dir, path: dir + '/m.aontu', res: [],
            }, silentLog());
            const v = await b.run({ watch: false });
            node_assert_1.default.strictEqual(v.ok, ok, name + ' comment: expected ok=' + ok);
        }
    });
    (0, node_test_1.test)('model-serializer-mutated-values', async () => {
        const dir = GEN + '/ex-serializer';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu',
            res: [
                {
                    path: '/', build: async function mutate(build, ctx) {
                        if ('post' === ctx.step) {
                            build.model.gone = undefined;
                            build.model.helper = () => 1;
                            build.model.sym = Symbol('x');
                            build.model.list = [1, undefined, 2];
                            build.model.sparse = new Array(2);
                            build.model.when = new Date('2026-01-02T03:04:05.678Z');
                            build.model.wrap = { toJSON: () => ({ '10': 'ten', '9': 'nine' }) };
                            build.model['10'] = 'ten';
                            build.model['9'] = 'nine';
                        }
                        return okResult('mutate');
                    },
                },
                { path: '/', build: model_2.model_producer },
            ],
        }, silentLog());
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, true);
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(dir + '/m.json', { encoding: 'utf8' }), `{
  "10": "ten",
  "9": "nine",
  "a": 1,
  "list": [
    1,
    null,
    2
  ],
  "sparse": [
    null,
    null
  ],
  "when": "2026-01-02T03:04:05.678Z",
  "wrap": {
    "10": "ten",
    "9": "nine"
  }
}`);
    });
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
    // A project still on model-config.aon is moved to model-config.aontu: the
    // file is renamed and each .aon include points at .aontu, in any quote
    // style, with every other byte kept.
    (0, node_test_1.test)('legacy-config-migrates-forward', async () => {
        const dir = GEN + '/ex-migrate';
        const cdir = dir + '/model/.model-config';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(cdir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\n');
        await (0, promises_1.writeFile)(cdir + '/local.aontu', 'sys: model: local: true\n');
        await (0, promises_1.writeFile)(cdir + '/model-config.aon', LEGACY_CONFIG);
        const model = new model_1.Model({
            fs: node_fs_1.default, path: dir + '/model/model.aontu', base: dir + '/model',
            debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'migrated config did not build: ' + errtext(br.errs));
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(cdir + '/model-config.aon'), false, 'the legacy config should be gone once migrated');
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(cdir + '/model-config.aontu', 'utf8'), MIGRATED_CONFIG);
        const config = JSON.parse(await (0, promises_1.readFile)(cdir + '/model-config.json', 'utf8'));
        node_assert_1.default.strictEqual(config.sys.model.local, true);
        node_assert_1.default.strictEqual(config.sys.model.was, '@voxgig/model/model/.model-config/model-config.aon');
    });
    (0, node_test_1.test)('aontu-config-wins-over-legacy', async () => {
        const dir = GEN + '/ex-migrate-both';
        const cdir = dir + '/model/.model-config';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(cdir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\n');
        await (0, promises_1.writeFile)(cdir + '/model-config.aon', 'sys: model: which: aon\n');
        await (0, promises_1.writeFile)(cdir + '/model-config.aontu', 'sys: model: which: aontu\n');
        const model = new model_1.Model({
            fs: node_fs_1.default, path: dir + '/model/model.aontu', base: dir + '/model',
            debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, errtext(br.errs));
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(cdir + '/model-config.aon', 'utf8'), 'sys: model: which: aon\n');
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(cdir + '/model-config.aontu', 'utf8'), 'sys: model: which: aontu\n');
        const config = JSON.parse(await (0, promises_1.readFile)(cdir + '/model-config.json', 'utf8'));
        node_assert_1.default.strictEqual(config.sys.model.which, 'aontu');
    });
    (0, node_test_1.test)('missing-config-is-created-as-aontu', async () => {
        const dir = GEN + '/ex-config-new';
        const cdir = dir + '/model/.model-config';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\n');
        const model = new model_1.Model({
            fs: node_fs_1.default, path: dir + '/model/model.aontu', base: dir + '/model',
            debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, errtext(br.errs));
        node_assert_1.default.ok((await (0, promises_1.readFile)(cdir + '/model-config.aontu', 'utf8')).includes('@"@voxgig/model/model/.model-config/model-config.aontu"'));
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(cdir + '/model-config.aon'), false);
    });
    // A dry run migrates in memory: the build uses the migrated config and
    // nothing on disk changes.
    (0, node_test_1.test)('dryrun-migrates-legacy-config-in-memory', async () => {
        const dir = GEN + '/ex-migrate-dry';
        const cdir = dir + '/model/.model-config';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(cdir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\n');
        await (0, promises_1.writeFile)(cdir + '/local.aontu', 'sys: model: local: true\n');
        await (0, promises_1.writeFile)(cdir + '/model-config.aon', LEGACY_CONFIG);
        const model = new model_1.Model({
            path: dir + '/model/model.aontu', base: dir + '/model',
            debug: 'silent', dryrun: true,
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'dry run did not build: ' + errtext(br.errs));
        node_assert_1.default.strictEqual(await (0, promises_1.readFile)(cdir + '/model-config.aon', 'utf8'), LEGACY_CONFIG);
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(cdir + '/model-config.aontu'), false);
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(cdir + '/model-config.json'), false);
        node_assert_1.default.strictEqual(model.config?.watch.build?.model.sys.model.local, true);
    });
    (0, node_test_1.test)('dryrun-creates-missing-config-in-memory', async () => {
        const dir = GEN + '/ex-config-dry';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\n');
        const model = new model_1.Model({
            path: dir + '/model/model.aontu', base: dir + '/model',
            debug: 'silent', dryrun: true,
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'dry run did not build: ' + errtext(br.errs));
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(dir + '/model/.model-config'), false);
        node_assert_1.default.strictEqual(node_fs_1.default.existsSync(dir + '/model/model.json'), false);
    });
    (0, node_test_1.test)('dryrun-config-is-served-back-by-resolved-path', () => {
        const at = GEN + '/ex-readback/model/.model-config/model-config.aontu';
        const fs = (0, config_1.readBack)(node_fs_1.default, GEN + '/ex-readback/model/x/../.model-config/model-config.aontu', 'x: 1\n');
        node_assert_1.default.strictEqual(fs.readFileSync(at, 'utf8'), 'x: 1\n');
        node_assert_1.default.strictEqual(String(fs.readFileSync(node_path_1.default.resolve(at))), 'x: 1\n');
        node_assert_1.default.strictEqual(typeof fs.statSync(at).mtimeMs, 'number');
        node_assert_1.default.throws(() => fs.readFileSync(GEN + '/ex-readback/absent.aontu', 'utf8'));
    });
    (0, node_test_1.test)('dryrun-watch-starts-with-config-in-memory', async () => {
        const dir = GEN + '/ex-config-dry-watch';
        const cdir = dir + '/model/.model-config';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(cdir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\n');
        await (0, promises_1.writeFile)(cdir + '/local.aontu', 'sys: model: local: true\n');
        await (0, promises_1.writeFile)(cdir + '/model-config.aon', LEGACY_CONFIG);
        const model = new model_1.Model({
            path: dir + '/model/model.aontu', base: dir + '/model',
            debug: 'silent', dryrun: true,
        });
        try {
            const failed = await model.start();
            node_assert_1.default.strictEqual(failed, undefined, 'dry run did not start: ' + errtext(failed?.errs));
            node_assert_1.default.strictEqual(await (0, promises_1.readFile)(cdir + '/model-config.aon', 'utf8'), LEGACY_CONFIG);
            node_assert_1.default.strictEqual(node_fs_1.default.existsSync(cdir + '/model-config.aontu'), false);
        }
        finally {
            await model.stop();
        }
    });
});
//# sourceMappingURL=extra.test.js.map