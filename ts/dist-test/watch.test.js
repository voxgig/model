"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const model_1 = require("../dist/model");
const GEN = __dirname + '/../test/_gen';
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
        await (0, promises_1.writeFile)(base + '/model.jsonic', 'top: 1\nval: @"./zed.jsonic"\n');
        await (0, promises_1.writeFile)(base + '/zed.jsonic', '2');
        // Standalone config (no actions) so we don't depend on package resolution.
        await (0, promises_1.writeFile)(base + '/.model-config/model-config.jsonic', 'sys: model: action: {}\n');
        const out = base + '/model.json';
        const model = new model_1.Model({ path: base + '/model.jsonic', base });
        try {
            await model.start();
            node_assert_1.default.ok(await waitFor(async () => (await readVal(out)) === 2), 'initial build should produce val:2');
            // Let the dependency watchers attach before mutating zed.jsonic.
            await new Promise(r => setTimeout(r, 250));
            await (0, promises_1.writeFile)(base + '/zed.jsonic', '7');
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
        await (0, promises_1.writeFile)(base + '/model.jsonic', 'top: 1\n');
        await (0, promises_1.writeFile)(base + '/.model-config/model-config.jsonic', "sys: model: action: { mark: load: 'build/mark' }\n");
        await (0, promises_1.writeFile)(dir + '/build/mark.js', "const Path = require('node:path')\n" +
            'let n = 0\n' +
            'module.exports = async function mark(model, build) {\n' +
            "  n++\n" +
            "  const root = Path.resolve(build.path, '..', '..')\n" +
            "  build.fs.writeFileSync(Path.resolve(root, 'mark.txt'), String(n))\n" +
            '  return { ok: true }\n' +
            '}\n');
        const mark = dir + '/mark.txt';
        const model = new model_1.Model({ path: base + '/model.jsonic', base });
        try {
            await model.start();
            node_assert_1.default.ok(await waitFor(async () => null != await read(mark)), 'initial build should run the mark action');
            const first = await read(mark);
            // Let the config watcher attach, then edit a config file.
            await new Promise(r => setTimeout(r, 250));
            await (0, promises_1.appendFile)(base + '/.model-config/model-config.jsonic', '\n# touch to trigger a config rebuild\n');
            node_assert_1.default.ok(await waitFor(async () => {
                const cur = await read(mark);
                return null != cur && cur !== first;
            }), 'config change should re-run the model build (mark should advance)');
        }
        finally {
            await model.stop();
        }
    });
});
//# sourceMappingURL=watch.test.js.map