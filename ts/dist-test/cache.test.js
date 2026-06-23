"use strict";
/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */
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
const GEN = __dirname + '/../test/_gen';
function silentLog() {
    return (0, util_1.prettyPino)('test', { debug: 'silent' });
}
// Push a file's mtime clearly into the future so a content change is always
// seen as newer than the cached signature, regardless of filesystem mtime
// resolution.
function bumpMtime(path) {
    const future = new Date(Date.now() + 5000);
    node_fs_1.default.utimesSync(path, future, future);
}
(0, node_test_1.describe)('cache', () => {
    // A second build with no file change is a cache hit: resolveModel returns
    // early and reuses the same model object rather than re-unifying.
    (0, node_test_1.test)('reuses-unchanged-model', async () => {
        const dir = GEN + '/cache-hit';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const path = dir + '/m.jsonic';
        await (0, promises_1.writeFile)(path, 'a: 1\n');
        const b = (0, build_1.makeBuild)({ fs: node_fs_1.default, base: dir, path, res: [] }, silentLog());
        const r1 = await b.run({ watch: false });
        node_assert_1.default.strictEqual(r1.ok, true);
        const model1 = b.model;
        node_assert_1.default.deepStrictEqual(model1, { a: 1 });
        // No change between runs -> the cached model object is reused (identity
        // preserved). A re-unification would produce a fresh object.
        const r2 = await b.run({ watch: false });
        node_assert_1.default.strictEqual(r2.ok, true);
        node_assert_1.default.strictEqual(b.model, model1, 'unchanged model should be reused (cache hit)');
    });
    // Changing a tracked file invalidates the cache: the next build re-unifies
    // and produces a fresh model reflecting the new source.
    (0, node_test_1.test)('re-resolves-changed-model', async () => {
        const dir = GEN + '/cache-miss';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const path = dir + '/m.jsonic';
        await (0, promises_1.writeFile)(path, 'a: 1\n');
        const b = (0, build_1.makeBuild)({ fs: node_fs_1.default, base: dir, path, res: [] }, silentLog());
        const r1 = await b.run({ watch: false });
        node_assert_1.default.strictEqual(r1.ok, true);
        const model1 = b.model;
        await (0, promises_1.writeFile)(path, 'a: 2\n');
        bumpMtime(path);
        const r2 = await b.run({ watch: false });
        node_assert_1.default.strictEqual(r2.ok, true);
        node_assert_1.default.notStrictEqual(b.model, model1, 'changed file should be re-resolved (cache miss)');
        node_assert_1.default.deepStrictEqual(b.model, { a: 2 });
    });
    // A successful build primes the cache, but a later model error must still
    // surface: the cache cannot mask a freshly broken model.
    (0, node_test_1.test)('error-not-masked-by-cache', async () => {
        const dir = GEN + '/cache-err';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const path = dir + '/m.jsonic';
        await (0, promises_1.writeFile)(path, 'a: 1\n');
        const b = (0, build_1.makeBuild)({ fs: node_fs_1.default, base: dir, path, res: [] }, silentLog());
        node_assert_1.default.strictEqual((await b.run({ watch: false })).ok, true);
        // Conflicting scalar values do not unify.
        await (0, promises_1.writeFile)(path, 'a: 1\na: 2\n');
        bumpMtime(path);
        const bad = await b.run({ watch: false });
        node_assert_1.default.strictEqual(bad.ok, false, 'broken model must not be served from cache');
        node_assert_1.default.ok(0 < bad.errs.length);
    });
});
//# sourceMappingURL=cache.test.js.map