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
// them: msg first, then model.
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
    // === the declared shape: a list ===
    (0, node_test_1.test)('valid-list-builds', async () => {
        const { br, json } = await runMsg('valid', 'main: msg: [\n' +
            '  { pat: [ {aim: web}, {save: item} ], doc: "Save an item" }\n' +
            ']\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.ok((0, node_fs_2.existsSync)(json));
    });
    // THE REASON THE SHAPE IS A LIST. A gateway proxy and the message it
    // forwards to share their last pattern pair, so any key derived from that
    // pair collides. A list has no key.
    (0, node_test_1.test)('gateway-proxy-and-its-target', async () => {
        const { br } = await runMsg('proxy', 'main: msg: [\n' +
            '  { pat: [ {aim: todo}, {save: item} ] }\n' +
            '  { pat: [ {aim: web}, {on: todo}, {save: item} ], file: "./web_save_item" }\n' +
            ']\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    (0, node_test_1.test)('multiple-definitions-build', async () => {
        const { br } = await runMsg('multi', 'main: msg: [\n' +
            '  { pat: [ {aim: web}, {save: item} ] }\n' +
            '  { pat: [ {aim: web}, {load: item} ] }\n' +
            '  { pat: [ {aim: cag}, {publish: fixture} ] }\n' +
            ']\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // A one-pair pattern is legal.
    (0, node_test_1.test)('single-pair-pattern', async () => {
        const { br } = await runMsg('single', 'main: msg: [ { pat: [ {get: info} ] } ]\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    (0, node_test_1.test)('empty-list-builds', async () => {
        const { br } = await runMsg('emptylist', 'main: msg: []\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // === backwards compatibility ===
    (0, node_test_1.test)('legacy-chain-untouched', async () => {
        const { br, json } = await runMsg('legacy', 'main: msg: aim: web: {\n' +
            '  get: info: {}\n' +
            "  on: todo: { save: item: { '$': { file: './web_save_item' } } }\n" +
            '}\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.ok((0, node_fs_2.existsSync)(json));
    });
    (0, node_test_1.test)('no-messages', async () => {
        const { br } = await runMsg('none', 'main: entity: item: { name: "item" }\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // A legacy pattern pair spelled `pat:` is a chain node - its value is a map,
    // not a list - so it is not mistaken for a definition.
    (0, node_test_1.test)('legacy-pat-key-is-not-a-definition', async () => {
        const { br } = await runMsg('legacy-pat', 'main: msg: pat: web: { save: item: {} }\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // A definition among chain nodes is reported, not walked: the nested walk
    // would read its metadata keys as pattern pairs.
    (0, node_test_1.test)('definition-in-a-chain-is-rejected', async () => {
        const { br, json } = await runMsg('keyed', 'main: msg: save_item: { pat: [ {aim: web}, {save: item} ] }\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg "save_item": a message definition must be declared in the main\.msg list/);
        node_assert_1.default.strictEqual((0, node_fs_2.existsSync)(json), false);
    });
    // === duplicate patterns ===
    (0, node_test_1.test)('duplicate-pat-fails', async () => {
        const { br } = await runMsg('dup', 'main: msg: [\n' +
            '  { pat: [ {aim: web}, {save: item} ] }\n' +
            '  { pat: [ {aim: web}, {save: item} ], doc: "again" }\n' +
            ']\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[1\]: pat \[aim:web,save:item\] is already declared by msg \[0\]/);
    });
    // Same pairs in a different order are different patterns.
    (0, node_test_1.test)('reordered-pat-is-distinct', async () => {
        const { br } = await runMsg('reorder', 'main: msg: [\n' +
            '  { pat: [ {aim: web}, {save: item} ] }\n' +
            '  { pat: [ {save: item}, {aim: web} ] }\n' +
            ']\n');
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
    });
    // === malformed definitions ===
    (0, node_test_1.test)('empty-pat-fails', async () => {
        const { br } = await runMsg('emptypat', 'main: msg: [ { pat: [] } ]\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[0\]: pat declares no pattern pairs/);
    });
    (0, node_test_1.test)('missing-pat-fails', async () => {
        const { br } = await runMsg('nopat', 'main: msg: [ { doc: "no pattern" } ]\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[0\]: has no pat list/);
    });
    (0, node_test_1.test)('multi-key-pair-fails', async () => {
        const { br } = await runMsg('multikey', 'main: msg: [ { pat: [ {aim: web, save: item} ] } ]\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[0\]: pat pair 0 is not a single key:value pair/);
    });
    (0, node_test_1.test)('non-string-pair-value-fails', async () => {
        const { br } = await runMsg('nonstring', 'main: msg: [ { pat: [ {aim: web}, {save: 1} ] } ]\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[0\]: pat pair 1 \(save\) value is not a string/);
    });
    (0, node_test_1.test)('non-string-file-fails', async () => {
        const { br } = await runMsg('badfile', 'main: msg: [ { pat: [ {aim: web}, {save: item} ], file: 1 } ]\n');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[0\]: file is not a string/);
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
    });
    (0, node_test_1.test)('checkMsg-rejects-non-definition-elements', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: ['nope'] } }), ['model msg [0]: is not a message definition']);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: [null] } }), ['model msg [0]: is not a message definition']);
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: [[]] } }), ['model msg [0]: is not a message definition']);
    });
    (0, node_test_1.test)('checkMsg-rejects-non-map-pat-element', () => {
        for (const elem of ['aim:web', [], {}]) {
            node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: [{ pat: [elem] }] } }), ['model msg [0]: pat pair 0 is not a single key:value pair']);
        }
    });
    // A malformed pair stops that definition's remaining checks.
    (0, node_test_1.test)('checkMsg-reports-one-problem-per-broken-pattern', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({ main: { msg: [{ pat: [{ save: 1 }], file: 2 }] } }), ['model msg [0]: pat pair 0 (save) value is not a string']);
    });
    // Problems come out in list order, which is the same in both
    // implementations - no sorting needed, unlike map keys.
    (0, node_test_1.test)('checkMsg-orders-problems-by-index', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({
            main: {
                msg: [
                    { pat: [{ a: 'b' }] },
                    { pat: [] },
                    { pat: [{ a: 'b' }] },
                ]
            }
        }), [
            'model msg [1]: pat declares no pattern pairs',
            'model msg [2]: pat [a:b] is already declared by msg [0]',
        ]);
    });
    // Pattern identity is structural, not a rendering of it: a value carrying
    // the delimiters used to display a pattern must not collide with a
    // genuinely different pattern.
    (0, node_test_1.test)('delimiters-in-values-do-not-collide', () => {
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({
            main: {
                msg: [
                    { pat: [{ a: 'b,c:d' }] },
                    { pat: [{ a: 'b' }, { c: 'd' }] },
                ]
            }
        }), []);
    });
    // Two definitions in a chain are reported in byte order of the key, so both
    // implementations agree (Go map iteration is otherwise random).
    (0, node_test_1.test)('definitions-in-a-chain-are-ordered', () => {
        const why = ': a message definition must be declared in the main.msg list' +
            ', not as a keyed entry (main: msg: [ { pat: [...] } ])';
        node_assert_1.default.deepStrictEqual((0, msg_1.checkMsg)({
            main: {
                msg: {
                    zz: { pat: [{ a: 'b' }] },
                    aa: { pat: [{ a: 'b' }] },
                }
            }
        }), [
            'model msg "aa"' + why,
            'model msg "zz"' + why,
        ]);
    });
    // === producer mechanics ===
    // The check runs in both phases. It has to: a pre action can request a
    // reload, and the build re-resolves the model after the pre phase, so a
    // pre-only check would let the regenerated model through unchecked.
    (0, node_test_1.test)('producer-checks-in-post-too', async () => {
        const build = {
            model: { main: { msg: [{ pat: [] }] } },
            errs: [],
            log: silentLog(),
        };
        const ctx = { step: 'post', watch: false, state: {} };
        const pr = await (0, msg_1.msg_producer)(build, ctx);
        node_assert_1.default.strictEqual(pr.ok, false);
        node_assert_1.default.match(errtext(pr.errs), /pat declares no pattern pairs/);
    });
    (0, node_test_1.test)('producer-reports-errors-on-build-and-result', async () => {
        const build = {
            model: { main: { msg: [{ pat: [] }] } },
            errs: [],
            log: silentLog(),
        };
        const ctx = { step: 'pre', watch: false, state: {} };
        const pr = await (0, msg_1.msg_producer)(build, ctx);
        node_assert_1.default.strictEqual(pr.ok, false);
        node_assert_1.default.strictEqual(pr.errs.length, 1);
        node_assert_1.default.ok(pr.errs[0] instanceof Error);
        node_assert_1.default.deepStrictEqual(build.errs, pr.errs);
    });
    // The real reload path: a pre producer rewrites the model source and asks
    // for a reload, turning a valid model into an invalid one.
    (0, node_test_1.test)('reloaded-model-is-rechecked', async () => {
        const dir = GEN + '/msg-reload';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        const path = dir + '/m.aon';
        await (0, promises_1.writeFile)(path, 'main: msg: [ { pat: [ {aim: web}, {save: item} ] } ]\n');
        let rewritten = false;
        const b = (0, build_1.makeBuild)({
            fs: node_fs_1.default, base: dir, path,
            res: [
                { path: '/', build: msg_1.msg_producer },
                { path: '/', build: model_2.model_producer },
                {
                    path: '/', build: async function rewrite(_build, ctx) {
                        const pr = {
                            ok: true, name: 'rewrite', step: ctx.step, active: true,
                            reload: false, errs: [], runlog: [],
                        };
                        if ('pre' === ctx.step && !rewritten) {
                            rewritten = true;
                            node_fs_1.default.writeFileSync(path, 'main: msg: [ { pat: [] } ]\n');
                            // Force a distinct mtime: resolveModel caches on it, and the
                            // rewrite can land inside the same millisecond as the original.
                            const future = new Date(Date.now() + 2000);
                            node_fs_1.default.utimesSync(path, future, future);
                            pr.reload = true;
                        }
                        return pr;
                    }
                },
            ],
        }, silentLog());
        const br = await b.run({ watch: false });
        node_assert_1.default.ok(rewritten, 'the rewrite producer did not run');
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /model msg \[0\]: pat declares no pattern pairs/);
        node_assert_1.default.strictEqual((0, node_fs_2.existsSync)(dir + '/m.json'), false);
    });
    // === wired into the Model ===
    (0, node_test_1.test)('model-runs-the-check', async () => {
        const dir = GEN + '/msg-model';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aon', 'main: msg: [ { pat: [] } ]\n');
        const model = new model_1.Model({
            path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.strictEqual(br.ok, false);
        node_assert_1.default.match(errtext(br.errs), /pat declares no pattern pairs/);
        node_assert_1.default.strictEqual((0, node_fs_2.existsSync)(dir + '/m.json'), false);
    });
    (0, node_test_1.test)('model-builds-a-valid-declaration', async () => {
        const dir = GEN + '/msg-model-ok';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir, { recursive: true });
        await (0, promises_1.writeFile)(dir + '/m.aon', 'main: msg: [ { pat: [ {aim: web}, {save: item} ] } ]\n');
        const model = new model_1.Model({
            path: dir + '/m.aon', base: dir, config: false, debug: 'silent',
        });
        const br = await model.run();
        node_assert_1.default.ok(br.ok, 'build failed: ' + errtext(br.errs));
        node_assert_1.default.ok((0, node_fs_2.existsSync)(dir + '/m.json'));
    });
});
//# sourceMappingURL=msg.test.js.map