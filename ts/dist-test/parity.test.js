"use strict";
/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Shared cross-language parity specs (top-level test/spec/*.tsv).
//
// Each row is (name, args, expected): args is [aontuSrc] and expected is the
// exact bytes of the model.json the build must write — object keys sorted,
// two-space indent, HTML characters literal, no trailing newline. The same
// fixtures drive the Go suite (go/parity_test.go), so a behavioural drift
// between the two implementations fails one of them. Spec files are
// auto-discovered: add a .tsv under test/spec/ and both suites pick it up.
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_fs_1 = require("node:fs");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const util_1 = require("@voxgig/util");
const build_1 = require("../dist/build");
const model_1 = require("../dist/producer/model");
const SPEC_DIR = path_1.default.join(__dirname, '..', '..', 'test', 'spec');
function loadSpec(file) {
    const text = fs_1.default.readFileSync(path_1.default.join(SPEC_DIR, file), 'utf8');
    const rows = [];
    const lines = text.split('\n');
    // Line 0 is the header (name/args/expected).
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if ('' === line.trim() || line.startsWith('#')) {
            continue;
        }
        const t1 = line.indexOf('\t');
        const t2 = line.indexOf('\t', t1 + 1);
        rows.push({
            name: line.slice(0, t1),
            args: JSON.parse(line.slice(t1 + 1, t2)),
            expected: JSON.parse(line.slice(t2 + 1)),
        });
    }
    return rows;
}
async function buildModelJson(name, src) {
    const base = path_1.default.join(__dirname, '..', 'test', '_gen', 'spec', name);
    (0, node_fs_1.mkdirSync)(base, { recursive: true });
    (0, node_fs_1.writeFileSync)(path_1.default.join(base, 'model.aon'), src);
    const log = (0, util_1.prettyPino)('test', {});
    const b = (0, build_1.makeBuild)({
        fs: fs_1.default,
        base,
        path: path_1.default.join(base, 'model.aon'),
        res: [{ path: '/', build: model_1.model_producer }],
    }, log);
    const r = await b.run({ watch: false });
    node_assert_1.default.ok(r.ok, 'build failed: ' + JSON.stringify(r.errs));
    return (0, node_fs_1.readFileSync)(path_1.default.join(base, 'model.json'), 'utf8');
}
(0, node_test_1.describe)('parity', () => {
    const files = fs_1.default.readdirSync(SPEC_DIR).filter(f => f.endsWith('.tsv')).sort();
    node_assert_1.default.ok(0 < files.length, 'no shared spec files in ' + SPEC_DIR);
    for (const file of files) {
        const group = file.slice(0, -'.tsv'.length);
        (0, node_test_1.describe)(group, () => {
            for (const row of loadSpec(file)) {
                (0, node_test_1.test)(row.name, async () => {
                    node_assert_1.default.strictEqual(await buildModelJson(group + '-' + row.name, String(row.args[0])), row.expected);
                });
            }
        });
    }
});
//# sourceMappingURL=parity.test.js.map