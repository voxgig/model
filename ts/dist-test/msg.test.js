"use strict";
/* Copyright © 2026 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Message declaration checks (ts/src/producer/msg.ts).
//
// Error behaviour, so per-language rather than a shared test/spec row; the Go
// suite mirrors these in go/msg_test.go. Sources here use plain aontu (no
// aliases or close()), because the checks read the RESOLVED model and must
// hold whatever the source used to express it.
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = require("node:fs/promises");
const node_fs_2 = require("node:fs");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const model_1 = require("../dist/model");
const model_2 = require("../dist/producer/model");
const msg_1 = require("../dist/producer/msg");
const GEN = __dirname + '/../test/_gen';
function silentLog() {
    return (0, util_1.prettyPino)('test', { debug: 'silent' });
}
function errtext(errs) {
    return (errs || []).map((e) => e && (e.msg || e.message) || String(e)).join(' | ');
}
// Build src through the msg check and the model producer, as the Model wires
// them: msg first (pre), model second (post).
async function runMsg(name, src) {
    const dir = GEN + '/msg-' + name;
    await (0, promises_1.rm)(dir, { recursive: true, force: true });
    await (0, promises_1.mkdir)(dir, { recursive: true });
    await (0, promises_1.writeFile)(dir + '/m.aon', src);
    const b = (0, build_1.makeBuild)({
        fs: node_fs_1.default, base: dir, path: dir + '/m.aon',
        res: [
            { path: '/', build: msg_1.msg_producer },
            { path: '/', build: model_2.model_producer },
        ],
    }, silentLog());
    const br = await b.run({ watch: false });
    return { br, dir, json: dir + '/m.json' };
}
(0, node_test_1.describe)('msg', () => {
    // === declared shape, valid ===
    (0, node_test_1.test)('valid-declaration-builds', async () => {
        const { br, json } = await runMsg('valid', 'main: msg: save_item: {\n' +
            '  pat: [ {aim: web}, {save: item} ]\n' +
            '  doc: "Save a todo item"\n' +
            '}\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.ok((0, node_fs_2.existsSync)(json));
    });
    // Several messages, each with its own pattern, all consistent.
    (0, node_test_1.test)('multiple-declarations-build', async () => {
        const { br } = await runMsg('multi', 'main: msg: {\n' +
            '  save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
            '  load_item: { pat: [ {aim: web}, {load: item} ] }\n' +
            '  publish_fixture: { pat: [ {aim: cag}, {publish: fixture} ] }\n' +
            '}\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // A single-pair pattern is legal: the key is verb_noun of that one pair.
    (0, node_test_1.test)('single-pair-pattern', async () => {
        const { br } = await runMsg('single', 'main: msg: get_info: { pat: [ {get: info} ] }\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // === backwards compatibility ===
    // The legacy nested chain carries no pat list, so it is left alone.
    (0, node_test_1.test)('legacy-chain-untouched', async () => {
        const { br, json } = await runMsg('legacy', 'main: msg: aim: web: {\n' +
            '  get: info: {}\n' +
            "  on: todo: { save: item: { '$': { file: './web_save_item' } } }\n" +
            '}\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.ok((0, node_fs_2.existsSync)(json));
    });
    // Both shapes in one model: the chain is skipped, the declaration checked.
    (0, node_test_1.test)('mixed-shapes-build', async () => {
        const { br } = await runMsg('mixed', 'main: msg: {\n' +
            '  aim: web: { save: item: {} }\n' +
            '  publish_fixture: { pat: [ {aim: cag}, {publish: fixture} ] }\n' +
            '}\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // A legacy pattern pair spelled `pat:` is still a chain node - its value is
    // a map, not a list - so the discriminator does not misread it.
    (0, node_test_1.test)('legacy-pat-key-not-a-definition', async () => {
        const { br } = await runMsg('legacy-pat', 'main: msg: pat: web: { save: item: {} }\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // A model with no messages at all builds.
    (0, node_test_1.test)('no-messages', async () => {
        const { br } = await runMsg('none', 'main: entity: item: { name: "item" }\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // === key / last-pair consistency ===
    (0, node_test_1.test)('key-mismatch-fails', async () => {
        const { br, json } = await runMsg('mismatch', 'main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg "save_todo": key does not match last pat pair save:item \(expected "save_item"\)/);
        // The check runs in the pre phase, so nothing was written.
        node_assert_1.default.strictEqual((0, node_fs_2.existsSync)(json), false);
    });
    // The LAST pair names the key, not the first.
    (0, node_test_1.test)('key-from-last-pair-only', async () => {
        const { br } = await runMsg('firstpair', 'main: msg: aim_web: { pat: [ {aim: web}, {save: item} ] }\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /expected "save_item"/);
    });
    // === duplicate patterns ===
    (0, node_test_1.test)('duplicate-pat-fails', async () => {
        const { br } = await runMsg('dup', 'main: msg: {\n' +
            '  save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
            '  x_save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
            '}\n');
        node_assert_1.default.strictEqual(br.ok, false);
        const text = errtext(br.errs);
        node_assert_1.default.match(text, /model msg "x_save_item": pat \[aim:web,save:item\] is already declared by "save_item"/);
    });
    // Same pairs in a different order are different patterns.
    (0, node_test_1.test)('reordered-pat-is-distinct', async () => {
        const { br } = await runMsg('reorder', 'main: msg: {\n' +
            '  save_item: { pat: [ {aim: web}, {save: item} ] }\n' +
            '  aim_web: { pat: [ {save: item}, {aim: web} ] }\n' +
            '}\n');
        // Distinct patterns, and each key matches its own last pair.
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // === malformed patterns ===
    (0, node_test_1.test)('empty-pat-fails', async () => {
        const { br } = await runMsg('empty', 'main: msg: save_item: { pat: [] }\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg "save_item": pat declares no pattern pairs/);
    });
    (0, node_test_1.test)('multi-key-pair-fails', async () => {
        const { br } = await runMsg('multikey', 'main: msg: save_item: { pat: [ {aim: web, save: item} ] }\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg "save_item": pat pair 0 is not a single key:value pair/);
    });
    (0, node_test_1.test)('non-string-pair-value-fails', async () => {
        const { br } = await runMsg('nonstring', 'main: msg: save_item: { pat: [ {aim: web}, {save: 1} ] }\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg "save_item": pat pair 1 \(save\) value is not a string/);
    });
    // === checkMsg unit cases (shapes aontu source cannot easily express) ===
    (0, node_test_1.test)('checkMsg-tolerates-non-model-shapes', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)(undefined), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)(null), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({}), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: 'nope' }), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: {} }), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: 'nope' } }), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: [] } }), []);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: {} } }), []);
        // Entries that are not maps are not declarations.
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: { a: 1, b: null } } }), []);
    });
    (0, node_test_1.test)('checkMsg-rejects-non-map-pat-element', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: { save_item: { pat: ['aim:web'] } } } }), ['model msg "save_item": pat pair 0 is not a single key:value pair']);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: { save_item: { pat: [[]] } } } }), ['model msg "save_item": pat pair 0 is not a single key:value pair']);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: { save_item: { pat: [{}] } } } }), ['model msg "save_item": pat pair 0 is not a single key:value pair']);
    });
    // A malformed pair stops that message's checks: no key-mismatch error is
    // piled on top of a pattern that could not be read.
    (0, node_test_1.test)('checkMsg-reports-one-problem-per-broken-pattern', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: { wrong_name: { pat: [{ save: 1 }] } } } }), ['model msg "wrong_name": pat pair 0 (save) value is not a string']);
    });
    // Problems are reported in byte order of the message name, so the two
    // implementations agree (Go map iteration is otherwise random).
    (0, node_test_1.test)('checkMsg-orders-problems-by-name', () => {
        const problems = (0, msg_1.checkMsg)({
            main: {
                msg: {
                    zz: { pat: [{ a: 'b' }] },
                    aa: { pat: [{ a: 'b' }] },
                    mm: { pat: [] },
                }
            }
        });
        node_assert_1.default.deepStrictEqual(problems, [
            'model msg "aa": key does not match last pat pair a:b (expected "a_b")',
            'model msg "mm": pat declares no pattern pairs',
            'model msg "zz": key does not match last pat pair a:b (expected "a_b")',
            'model msg "zz": pat [a:b] is already declared by "aa"',
        ]);
    });
    // === producer mechanics ===
    (0, node_test_1.test)('producer-is-a-noop-in-post', async () => {
        const build = {
            model: { main: { msg: { wrong: { pat: [{ save: 'item' }] } } } },
            errs: [],
            log: silentLog(),
        };
        const ctx = { step: 'post', watch: false, state: {} };
        const pr = await (0, msg_1.msg_producer)(build, ctx);
        node_assert_1.default.strictEqual(pr.ok, true);
        node_assert_1.default.deepStrictEqual(pr.errs, []);
        node_assert_1.default.deepStrictEqual(build.errs, []);
    });
    // A failing check reports its errors both ways: on the result and on the
    // build (BuildImpl.run only collects thrown errors).
    (0, node_test_1.test)('producer-reports-errors-on-build-and-result', async () => {
        const build = {
            model: { main: { msg: { wrong: { pat: [{ save: 'item' }] } } } },
            errs: [],
            log: silentLog(),
        };
        const ctx = { step: 'pre', watch: false, state: {} };
        const pr = await (0, msg_1.msg_producer)(build, ctx);
        node_assert_1.default.strictEqual(pr.ok, false);
        node_assert_1.default.strictEqual(pr.errs.length, 1);
        node_assert_1.default.ok(pr.errs[0] instanceof Error);
        node_assert_1.default.match(pr.errs[0].message, /expected "save_item"/);
        node_assert_1.default.deepStrictEqual(build.errs, pr.errs);
    });
    // === wired into the Model ===
    (0, node_test_1.test)('model-runs-the-check', async () => {
        const dir = GEN + '/msg-model';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aon', 'main: msg: save_todo: { pat: [ {aim: web}, {save: item} ] }\n');
        const model = new model_1.Model({
            path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /expected "save_item"/);
        node_assert_1.default.strictEqual((0, node_fs_2.existsSync)(dir + '/m.json'), false);
    });
    (0, node_test_1.test)('model-builds-a-valid-declaration', async () => {
        const dir = GEN + '/msg-model-ok';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aon', 'main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n');
        const model = new model_1.Model({
            path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.ok((0, node_fs_2.existsSync)(dir + '/m.json'));
    });
});
//# sourceMappingURL=msg.test.js.map