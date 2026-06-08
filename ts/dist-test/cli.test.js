"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_test_1 = require("node:test");
const node_assert_1 = __importDefault(require("node:assert"));
const GEN = __dirname + '/../test/_gen';
const BIN = __dirname + '/../bin/voxgig-model';
(0, node_test_1.describe)('cli', () => {
    // The -b/--build flag is parsed into buildargs; confirm those args actually
    // reach a build action via the real CLI entry point.
    (0, node_test_1.test)('passes-build-args', async () => {
        const dir = GEN + '/cli01';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model/.model-config', { recursive: true });
        await (0, promises_1.mkdir)(dir + '/build', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.jsonic', 'top: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.jsonic', "sys: model: action: { recordargs: load: 'build/recordargs' }\n");
        await (0, promises_1.writeFile)(dir + '/build/recordargs.js', "const Path = require('node:path')\n" +
            'module.exports = async function recordargs(model, build) {\n' +
            "  const root = Path.resolve(build.path, '..', '..')\n" +
            "  build.fs.writeFileSync(Path.resolve(root, 'args-out.json'),\n" +
            '    JSON.stringify(build.args ?? null))\n' +
            '  return { ok: true }\n' +
            '}\n');
        const out = dir + '/args-out.json';
        await (0, promises_1.rm)(out, { force: true });
        // No shell: args array avoids cross-platform quoting issues. Barewords
        // keep the jsonic free of embedded quotes.
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN, dir + '/model/model.jsonic', '-b', '{outer:{inner:VAL}}'], { encoding: 'utf8' });
        node_assert_1.default.strictEqual(res.status, 0, 'cli should exit 0\nstdout:' + res.stdout + '\nstderr:' + res.stderr);
        const args = JSON.parse(await (0, promises_1.readFile)(out, 'utf8'));
        node_assert_1.default.deepStrictEqual(args, { outer: { inner: 'VAL' } });
    });
});
//# sourceMappingURL=cli.test.js.map