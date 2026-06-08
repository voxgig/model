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
});
//# sourceMappingURL=watch.test.js.map