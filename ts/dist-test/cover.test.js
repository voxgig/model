"use strict";
/* Copyright © 2026 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Coverage for the remaining error/branch paths in build, watch and
// model: generate throwing, watch canon/change bookkeeping, relative
// add paths, run-build error capture, and Model.start without config.
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const watch_1 = require("../dist/watch");
const model_1 = require("../dist/model");
const GEN = __dirname + '/../test/_gen';
function silentLog() {
    return (0, util_1.prettyPino)('test', { debug: 'silent' });
}
async function fresh(name) {
    const dir = GEN + '/' + name;
    await (0, promises_1.rm)(dir, { recursive: true, force: true });
    await (0, promises_1.mkdir)(dir, { recursive: true });
    return dir;
}
(0, node_test_1.describe)('cover-build', () => {
    // A throw from aontu.generate is caught and surfaces as a build error
    // rather than escaping the build.
    (0, node_test_1.test)('generate-throw-becomes-build-error', async () => {
        const dir = await fresh('cv-gen-throw');
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path: dir + '/m.aontu', res: [],
        }, silentLog());
        b.aontu = {
            generate() {
                throw new Error('generate-boom');
            },
        };
        const v = await b.run({ watch: false });
        node_assert_1.default.strictEqual(v.ok, false);
        node_assert_1.default.ok(v.errs.some((e) => String(e.message ?? e).includes('generate-boom')));
    });
});
(0, node_test_1.describe)('cover-watch', () => {
    (0, node_test_1.test)('canon maps a path inside a watched folder to the folder', async () => {
        const dir = await fresh('cv-canon');
        const sub = node_path_1.default.join(dir, 'sub');
        await (0, promises_1.mkdir)(sub, { recursive: true });
        await (0, promises_1.writeFile)(node_path_1.default.join(sub, 'a.aontu'), 'a: 1\n');
        const w = new watch_1.Watch({ fs: node_fs_1.default, require: dir }, silentLog());
        w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) };
        try {
            await w.add(sub);
            // A file inside the watched folder canonicalises to the folder.
            node_assert_1.default.strictEqual(w.canon(node_path_1.default.join(sub, 'a.aontu')), sub);
            // An unrelated path is returned unchanged.
            const other = node_path_1.default.join(dir, 'other.aontu');
            node_assert_1.default.strictEqual(w.canon(other), other);
        }
        finally {
            await w.stop();
        }
    });
    (0, node_test_1.test)('handleChange records the last change', async () => {
        const dir = await fresh('cv-change');
        const w = new watch_1.Watch({ fs: node_fs_1.default, require: dir }, silentLog());
        w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) };
        try {
            const p = node_path_1.default.join(dir, 'x.aontu');
            w.handleChange(p);
            node_assert_1.default.strictEqual(w.lastChange.path, p);
            node_assert_1.default.ok(0 < w.lastChange.when);
        }
        finally {
            await w.stop();
        }
    });
    (0, node_test_1.test)('add resolves a relative path and ignores duplicates', async () => {
        const dir = await fresh('cv-add');
        await (0, promises_1.writeFile)(node_path_1.default.join(dir, 'r.aontu'), 'a: 1\n');
        const w = new watch_1.Watch({ fs: node_fs_1.default, require: dir }, silentLog());
        w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) };
        try {
            await w.add('r.aontu');
            const first = w.canonPaths.size;
            // The same path again is a no-op.
            await w.add('r.aontu');
            node_assert_1.default.strictEqual(w.canonPaths.size, first);
            node_assert_1.default.ok(w.canonPaths.has(node_path_1.default.join(dir, 'r.aontu')));
        }
        finally {
            await w.stop();
        }
    });
    (0, node_test_1.test)('a throwing build is captured as a failed run', async () => {
        const dir = await fresh('cv-run-throw');
        const w = new watch_1.Watch({ fs: node_fs_1.default, require: dir }, silentLog());
        w.build = {
            run: async () => {
                throw new Error('run-boom');
            },
        };
        try {
            const br = await w.run('model', false);
            node_assert_1.default.strictEqual(br.ok, false);
            node_assert_1.default.ok(br.errs.some((e) => String(e.message ?? e).includes('run-boom')));
        }
        finally {
            await w.stop();
        }
    });
});
(0, node_test_1.describe)('cover-model', () => {
    // With config:false the model runs standalone: start() delegates
    // straight to the watcher, no .model-config build.
    (0, node_test_1.test)('start without config uses the watcher directly', async () => {
        const dir = await fresh('cv-model-noconfig');
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const model = new model_1.Model({
            fs: node_fs_1.default,
            base: dir,
            path: dir + '/m.aontu',
            config: false,
            debug: 'silent',
            watch: false,
        });
        node_assert_1.default.strictEqual(model.config, undefined);
        let started = false;
        model.watch.start = async () => {
            started = true;
            return { ok: true, errs: [], runlog: [] };
        };
        try {
            const out = await model.start();
            node_assert_1.default.ok(started);
            node_assert_1.default.strictEqual(out.ok, true);
        }
        finally {
            await model.stop();
        }
    });
});
(0, node_test_1.describe)('cover-model-more', () => {
    // The debug branch in the constructor logs the resolved spec.
    (0, node_test_1.test)('debug logging of the model spec', async () => {
        const dir = await fresh('cv-model-debug');
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const model = new model_1.Model({
            fs: node_fs_1.default,
            base: dir,
            path: dir + '/m.aontu',
            config: false,
            debug: 'debug',
            watch: false,
        });
        try {
            node_assert_1.default.ok(model.log.isLevelEnabled('debug'));
        }
        finally {
            await model.stop();
        }
    });
    // start() with a config that fails returns the config's failed result
    // and never reaches the watcher.
    (0, node_test_1.test)('start returns a failed config build', async () => {
        const dir = await fresh('cv-model-badconfig');
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        const model = new model_1.Model({
            fs: node_fs_1.default,
            base: dir,
            path: dir + '/m.aontu',
            debug: 'silent',
            watch: false,
        });
        try {
            const failed = { ok: false, errs: [new Error('config-boom')], runlog: [] };
            model.config.run = async () => failed;
            let watchStarted = false;
            model.watch.start = async () => (watchStarted = true, { ok: true, errs: [], runlog: [] });
            const out = await model.start();
            node_assert_1.default.strictEqual(out.ok, false);
            node_assert_1.default.strictEqual(watchStarted, false);
        }
        finally {
            await model.stop();
        }
    });
    // In watch mode, files the model declares under sys.model.watch are
    // added to the watcher.
    (0, node_test_1.test)('sys.model.watch files are added to the watcher', async () => {
        const dir = await fresh('cv-model-watchmap');
        await (0, promises_1.writeFile)(dir + '/m.aontu', 'a: 1\n');
        await (0, promises_1.writeFile)(dir + '/extra.aontu', 'b: 2\n');
        // The watchmap is read from the CONFIG model, so declare it there.
        await (0, promises_1.mkdir)(dir + '/.model-config', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/.model-config/model-config.aontu', `
@"@voxgig/model/model/.model-config/model-config.aontu"

sys: model: action: {}
sys: model: watch: { "${dir}/extra.aontu": true }
`);
        // The watchmap is applied by the CONFIG build's producer, so config
        // stays enabled here.
        const model = new model_1.Model({
            fs: node_fs_1.default,
            base: dir,
            path: dir + '/m.aontu',
            debug: 'silent',
            watch: true,
        });
        try {
            const added = [];
            const origAdd = model.watch.add.bind(model.watch);
            model.watch.add = async (p) => {
                added.push(p);
                return origAdd(p);
            };
            // Only start() runs the config build in watch mode; keep the real
            // watchers out of it.
            model.watch.start = async () => ({ ok: true, errs: [], runlog: [] });
            model.config.start = () => undefined;
            await model.start();
            node_assert_1.default.ok(added.some((p) => p.includes('extra.aontu')));
        }
        finally {
            await model.stop();
        }
    });
});
(0, node_test_1.describe)('cover-watch-drain', () => {
    // drain() is re-entrant-safe: a second call while a drain is in flight
    // returns immediately (the running loop picks the queue up).
    (0, node_test_1.test)('drain returns early when already running', async () => {
        const dir = await fresh('cv-drain');
        const w = new watch_1.Watch({ fs: node_fs_1.default, require: dir }, silentLog());
        w.build = { run: async () => ({ ok: true, errs: [], runlog: [] }) };
        try {
            w.running = true;
            w.runq.push({ name: 'model', watch: false });
            await w.drain();
            // Untouched: the in-flight drain owns the queue.
            node_assert_1.default.strictEqual(w.runq.length, 1);
        }
        finally {
            w.running = false;
            await w.stop();
        }
    });
});
//# sourceMappingURL=cover.test.js.map