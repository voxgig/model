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
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'top: 1\n');
        await (0, promises_1.writeFile)(dir + '/model/.model-config/model-config.aontu', "sys: model: action: { recordargs: load: 'build/recordargs' }\n");
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
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN, dir + '/model/model.aontu', '-b', '{outer:{inner:VAL}}'], { encoding: 'utf8' });
        node_assert_1.default.strictEqual(res.status, 0, 'cli should exit 0\nstdout:' + res.stdout + '\nstderr:' + res.stderr);
        const args = JSON.parse(await (0, promises_1.readFile)(out, 'utf8'));
        node_assert_1.default.deepStrictEqual(args, { outer: { inner: 'VAL' } });
    });
    (0, node_test_1.test)('no-config-skips-config', async () => {
        const { existsSync } = require('node:fs');
        const dir = GEN + '/cli-noconfig';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'top: 1\n');
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN, dir + '/model/model.aontu', '--no-config', '-g', 'silent'], { encoding: 'utf8' });
        node_assert_1.default.strictEqual(res.status, 0, 'cli should exit 0\nstdout:' + res.stdout + '\nstderr:' + res.stderr);
        node_assert_1.default.deepStrictEqual(JSON.parse(await (0, promises_1.readFile)(dir + '/model/model.json', 'utf8')), { top: 1 });
        node_assert_1.default.strictEqual(existsSync(dir + '/model/.model-config'), false, '--no-config should not create .model-config');
    });
    // --no-config writes a model built WITHOUT the configured actions, and a
    // reduced model is still a valid one - nothing downstream fails on it. The
    // warning is the only thing standing between that and a committed model
    // missing whatever the actions contribute, so pin it.
    (0, node_test_1.test)('no-config-warns-when-it-writes', async () => {
        const dir = GEN + '/cli-noconfig-warn';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'top: 1\n');
        const run = (args) => (0, node_child_process_1.spawnSync)(process.execPath, [BIN, dir + '/model/model.aontu', ...args, '-g', 'silent'], { encoding: 'utf8' });
        const wrote = run(['--no-config']);
        node_assert_1.default.strictEqual(wrote.status, 0, 'cli should exit 0: ' + wrote.stderr);
        node_assert_1.default.match(wrote.stderr, /WARNING: --no-config/, 'writing with --no-config must warn');
        const dry = run(['--no-config', '--dryrun']);
        node_assert_1.default.strictEqual(dry.status, 0, 'cli should exit 0: ' + dry.stderr);
        node_assert_1.default.doesNotMatch(dry.stderr, /WARNING/, '--no-config --dryrun writes nothing, so must not warn');
        // No flag, no warning: it must not become noise on every build.
        const plain = run([]);
        node_assert_1.default.strictEqual(plain.status, 0, 'cli should exit 0: ' + plain.stderr);
        node_assert_1.default.doesNotMatch(plain.stderr, /WARNING/, 'an ordinary build must not warn');
    });
    (0, node_test_1.test)('missing-file-exits-nonzero', async () => {
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN, GEN + '/cli-nope/does-not-exist.aontu', '-g', 'silent'], { encoding: 'utf8' });
        node_assert_1.default.notStrictEqual(res.status, 0, 'missing file should exit non-zero');
        node_assert_1.default.match(res.stderr, /does not exist/);
    });
    // With no model path, the CLI reports the usage error and exits non-zero
    // rather than trying to build an empty path.
    (0, node_test_1.test)('no-args-exits-nonzero', async () => {
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN], { encoding: 'utf8' });
        node_assert_1.default.notStrictEqual(res.status, 0, 'no args should exit non-zero');
        node_assert_1.default.match(res.stderr, /ERROR/);
    });
    (0, node_test_1.test)('bad-model-exits-nonzero', async () => {
        const dir = GEN + '/cli-bad';
        await (0, promises_1.rm)(dir, { recursive: true, force: true });
        await (0, promises_1.mkdir)(dir + '/model', { recursive: true });
        await (0, promises_1.writeFile)(dir + '/model/model.aontu', 'x: 1\nx: 2\n');
        const res = (0, node_child_process_1.spawnSync)(process.execPath, [BIN, dir + '/model/model.aontu', '--no-config', '-g', 'silent'], { encoding: 'utf8' });
        node_assert_1.default.notStrictEqual(res.status, 0, 'invalid model should exit non-zero');
    });
});
//# sourceMappingURL=cli.test.js.map