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
const model_1 = require("../dist/model");
const watch_1 = require("../dist/watch");
const util_1 = require("@voxgig/util");
const GEN = __dirname + '/../test/_gen';
function silentLog() {
    return (0, util_1.prettyPino)('test', { debug: 'silent' });
}
async function waitFor(fn, ms = 6000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (await fn()) {
            return true;
        }
        await new Promise(r => setTimeout(r, 50));
    }
    return false;
}
async function readVal(file) {
    try {
        return JSON.parse(await (0, promises_1.readFile)(file, 'utf8')).val;
    }
    catch {
        return undefined;
    }
}
async function read(file) {
    try {
        return await (0, promises_1.readFile)(file, 'utf8');
    }
    catch {
        return undefined;
    }
}
(0, node_test_1.describe)('watch', () => {
    // Start watching, then change a dependency file and confirm the model is
    // rebuilt. Exercises the watch interval, change handling, drain queue,
    // dependency tracking, and clean shutdown of both watchers.
    (0, node_test_1.test)('rebuilds-on-change', async () => {
        const base = GEN + '/wat01/model';
        await (0, promises_1.rm)(GEN + '/wat01', { recursive: true, force: true });
        await (0, promises_1.mkdir)(base + '/.model-config', { recursive: true });
        await (0, promises_1.writeFile)(base + '/model.aontu', 'top: 1\nval: @"./zed.aontu"\n');
        await (0, promises_1.writeFile)(base + '/zed.aontu', '2');
        // Standalone config (no actions) so we don't depend on package resolution.
        await (0, promises_1.writeFile)(base + '/.model-config/model-config.aontu', 'sys: model: action: {}\n');
        const out = base + '/model.json';
        const model = new model_1.Model({ path: base + '/model.aontu', base });
        try {
            await model.start();
            node_assert_1.default.ok(await waitFor(async () => (await readVal(out)) === 2), 'initial build should produce val:2');
            // Let the dependency watchers attach before mutating zed.aontu.
            await new Promise(r => setTimeout(r, 250));
            await (0, promises_1.writeFile)(base + '/zed.aontu', '7');
            node_assert_1.default.ok(await waitFor(async () => (await readVal(out)) === 7), 'changing the dependency should rebuild to val:7');
        }
        finally {
            await model.stop();
        }
    });
    // A change to a config file should rebuild the config and re-trigger the
    // model build. The `mark` action bumps a counter on every model build, so
    // a change in its output proves the config change drove a rebuild.
    (0, node_test_1.test)('config-change-triggers-rebuild', async () => {
        const dir = GEN + '/wat02';
        const base = dir + '/model';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(base + '/.model-config', { recursive: true });
        await (0, promises_1.mkdir)(dir + '/build', { recursive: true });
        await (0, promises_1.writeFile)(base + '/model.aontu', 'top: 1\n');
        await (0, promises_1.writeFile)(base + '/.model-config/model-config.aontu', "sys: model: action: { mark: load: 'build/mark' }\n");
        await (0, promises_1.writeFile)(dir + '/build/mark.js', "const Path = require('node:path')\n" +
            'let n = 0\n' +
            'module.exports = async function mark(model, build) {\n' +
            "  n++\n" +
            "  const root = Path.resolve(build.path, '..', '..')\n" +
            "  build.fs.writeFileSync(Path.resolve(root, 'mark.txt'), String(n))\n" +
            '  return { ok: true }\n' +
            '}\n');
        const mark = dir + '/mark.txt';
        const model = new model_1.Model({ path: base + '/model.aontu', base });
        try {
            await model.start();
            node_assert_1.default.ok(await waitFor(async () => null != await read(mark)), 'initial build should run the mark action');
            const first = await read(mark);
            // Let the config watcher attach, then edit a config file.
            await new Promise(r => setTimeout(r, 250));
            await (0, promises_1.appendFile)(base + '/.model-config/model-config.aontu', '\n# touch to trigger a config rebuild\n');
            node_assert_1.default.ok(await waitFor(async () => {
                const cur = await read(mark);
                return null != cur && cur !== first;
            }), 'config change should re-run the model build (mark should advance)');
        }
        finally {
            await model.stop();
        }
    });
    // A failed rebuild while watching is reported, and the watcher recovers when
    // the model is fixed.
    (0, node_test_1.test)('recovers-from-error-while-watching', async () => {
        const base = GEN + '/wat03/model';
        await (0, promises_1.rm)(GEN + '/wat03', { recursive: true, force: true });
        await (0, promises_1.mkdir)(base + '/.model-config', { recursive: true });
        await (0, promises_1.writeFile)(base + '/model.aontu', 'val: 1\n');
        await (0, promises_1.writeFile)(base + '/.model-config/model-config.aontu', 'sys: model: action: {}\n');
        const out = base + '/model.json';
        const model = new model_1.Model({ path: base + '/model.aontu', base, debug: 'silent' });
        try {
            await model.start();
            node_assert_1.default.ok(await waitFor(async () => (await readVal(out)) === 1), 'initial build should produce val:1');
            // Break the model: conflicting scalar values do not unify.
            await new Promise(r => setTimeout(r, 200));
            await (0, promises_1.writeFile)(base + '/model.aontu', 'val: 1\nval: 2\n');
            await new Promise(r => setTimeout(r, 400)); // let the failed rebuild run
            // Fix it; the watcher should recover.
            await (0, promises_1.writeFile)(base + '/model.aontu', 'val: 9\n');
            node_assert_1.default.ok(await waitFor(async () => (await readVal(out)) === 9), 'watcher should recover to val:9 after the model is fixed');
        }
        finally {
            await model.stop();
        }
    });
    // With config disabled, start() watches the model directly (no config
    // watcher): the initial build runs and produces output, and stop() releases
    // the watcher cleanly.
    (0, node_test_1.test)('start-without-config', async () => {
        const base = GEN + '/wat04/model';
        await (0, promises_1.rm)(GEN + '/wat04', { recursive: true, force: true });
        await (0, promises_1.mkdir)(base, { recursive: true });
        await (0, promises_1.writeFile)(base + '/model.aontu', 'val: 5\n');
        const out = base + '/model.json';
        const model = new model_1.Model({
            path: base + '/model.aontu', base, config: false, debug: 'silent',
        });
        try {
            await model.start();
            node_assert_1.default.ok(await waitFor(async () => (await readVal(out)) === 5), 'initial build should produce val:5 with config disabled');
            node_assert_1.default.strictEqual(node_fs_1.default.existsSync(base + '/.model-config'), false, 'config disabled: no .model-config should be created');
        }
        finally {
            await model.stop();
        }
    });
});
// Unit coverage for Watch internals that the Model-level tests don't reach:
// the add/remove event modes and the dependency-description helper.
(0, node_test_1.describe)('watch-internals', () => {
    // The watcher only registers chokidar handlers for the enabled modes. With
    // add and rem enabled, ensureFSW wires up 'add' and 'unlink' as well as the
    // default 'change'. The watcher must still close cleanly.
    (0, node_test_1.test)('add-and-rem-modes-register', async () => {
        const dir = GEN + '/wat-modes';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const w = new watch_1.Watch({
            name: 'modes', path: dir + '/m.aontu', base: dir, fs: node_fs_1.default,
            watch: { mod: true, add: true, rem: true },
        }, silentLog());
        try {
            const fsw = w.ensureFSW();
            node_assert_1.default.ok(fsw, 'ensureFSW should create a watcher');
            // Calling again returns the same watcher (idempotent).
            node_assert_1.default.strictEqual(w.ensureFSW(), fsw);
        }
        finally {
            await w.stop();
        }
    });
    // descDeps renders nothing for missing/empty deps and a readable tree for
    // populated deps.
    (0, node_test_1.test)('descDeps-edge-cases', () => {
        const w = new watch_1.Watch({ name: 'd', path: '/x', base: '/', fs: node_fs_1.default }, silentLog());
        node_assert_1.default.strictEqual(w.descDeps(null), '');
        node_assert_1.default.strictEqual(w.descDeps({}), '');
        const desc = w.descDeps({ '/a.aontu': { '/b.aontu': { tar: '/b.aontu' } } });
        node_assert_1.default.match(desc, /\/a\.aontu/);
        node_assert_1.default.match(desc, /\/b\.aontu/);
    });
});
//# sourceMappingURL=watch.test.js.map