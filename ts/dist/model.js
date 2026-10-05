"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initModel = exports.Model = void 0;
// Not a namespace import, whose copy reads the deprecated F_OK getters.
const node_fs_1 = __importDefault(require("node:fs"));
const memfs_1 = require("memfs");
const util_1 = require("@voxgig/util");
const config_1 = require("./config");
const watch_1 = require("./watch");
const model_1 = require("./producer/model");
const local_1 = require("./producer/local");
const msg_1 = require("./producer/msg");
const init_1 = require("./init");
Object.defineProperty(exports, "initModel", { enumerable: true, get: function () { return init_1.initModel; } });
class Model {
    constructor(mspec) {
        this.trigger_model = false;
        const self = this;
        this.fs = copyFs(mspec.fs || node_fs_1.default);
        if (mspec.dryrun) {
            makeReadOnly(this.fs);
        }
        const pino = (0, util_1.prettyPino)('model', mspec);
        this.log = pino.child({ cmp: 'model' });
        this.log.info({ point: 'model-init' });
        if (this.log.isLevelEnabled('debug')) {
            this.log.debug({
                point: 'model-spec', mspec, note: '\n' +
                    JSON.stringify({ ...mspec, src: '<NOT-SHOWN>' }, null, 2)
                        .replace(/"/g, '')
                        .replaceAll(process.cwd(), '.')
            });
        }
        // Config is a special Watch to handle model config. It is optional: when
        // mspec.config is false, the .model-config/ build is skipped entirely and
        // the model runs on its own (see run/start below).
        const useConfig = false !== mspec.config;
        this.config = !useConfig ? undefined : makeConfig(mspec, this.log, this.fs, {
            path: '/',
            build: async function trigger_model(build, ctx) {
                let pres = {
                    ok: false, name: 'config', step: '', active: true, reload: false, errs: [], runlog: []
                };
                if ('post' !== ctx.step) {
                    pres.ok = true;
                    return pres;
                }
                if (self.trigger_model) {
                    const lastConfig = self.build.use?.config?.watch?.last;
                    if (lastConfig) {
                        lastConfig.build = () => build;
                    }
                    const br = await self.watch.run('model', true);
                    pres.ok = br.ok;
                    pres.errs = br.errs;
                }
                else {
                    self.trigger_model = true;
                    pres.ok = true;
                }
                if (ctx.watch) {
                    const watchmap = build.model?.sys?.model?.watch;
                    if (watchmap) {
                        Object.keys(watchmap).forEach((file) => {
                            self.watch.add(file);
                        });
                    }
                }
                return pres;
            }
        });
        // The actual model.
        this.build = {
            path: mspec.path,
            base: mspec.base,
            debug: mspec.debug,
            dryrun: mspec.dryrun,
            buildargs: mspec.buildargs,
            use: self.config ? { config: self.config } : {},
            res: [
                // Validates message declarations (pre phase), so an inconsistent
                // main.msg fails the build before any output is written.
                {
                    path: '/',
                    build: msg_1.msg_producer
                },
                {
                    path: '/',
                    build: model_1.model_producer
                },
                {
                    path: '/',
                    build: local_1.local_producer
                }
            ],
            require: mspec.require,
            log: this.log,
            fs: this.fs,
            watch: mspec.watch,
        };
        this.watch = new watch_1.Watch(self.build, this.log);
    }
    // Run once. With config enabled, the config build runs first and triggers
    // the model build; without it, the model build runs directly.
    async run() {
        this.trigger_model = false;
        if (!this.config) {
            return this.watch.run('model', false, '<start>');
        }
        const br = await this.config.run(false);
        return br.ok ? this.watch.run('model', false, '<start>') : br;
    }
    // Start watching for file changes. Runs an initial build, then watches
    // both the model files and (when enabled) the config files for ongoing
    // changes.
    async start() {
        this.trigger_model = false;
        if (!this.config) {
            return this.watch.start();
        }
        const br = await this.config.run(true);
        if (!br.ok) {
            return br;
        }
        // Watch config files too. The initial config build is already done
        // above, so start without forcing another one; a later config change
        // rebuilds the config and re-triggers the model build.
        this.config.start(false);
        return this.watch.start();
    }
    async stop() {
        // start() also spins up a config-file watcher; stop both so no
        // chokidar handle is left open keeping the process alive.
        await this.config?.stop();
        return this.watch.stop();
    }
}
exports.Model = Model;
function makeConfig(mspec, log, fs, trigger_model_build) {
    const cbase = mspec.base + '/.model-config';
    const cpath = cbase + '/' + config_1.CONFIG_FILE;
    const prep = (0, config_1.prepareConfig)(fs, cbase, log, mspec.dryrun);
    const cfs = null == prep.text ? fs : (0, config_1.readBack)(fs, cpath, prep.text, prep.from);
    let cspec = {
        name: 'config',
        path: cpath,
        base: cbase,
        debug: mspec.debug,
        res: [
            // Generate full config model and save as a file.
            {
                path: '/',
                build: model_1.model_producer
            },
            // Trigger main model build.
            trigger_model_build
        ],
        require: mspec.require,
        log,
        fs: cfs,
    };
    return new config_1.Config(cspec, log, prep);
}
const ACCESS_MODES = ['F_OK', 'R_OK', 'W_OK', 'X_OK'];
// A spread skips the access modes where fs hides them behind deprecated
// getters, so they come back from fs.constants, which holds the same values.
function copyFs(fs) {
    const copy = { ...fs };
    for (const mode of ACCESS_MODES) {
        if (undefined === copy[mode] && fs.constants) {
            copy[mode] = fs.constants[mode];
        }
    }
    return copy;
}
function makeReadOnly(fsm) {
    // NOTE: NOT COMPLETE!
    // Just for internal use,
    const writers = [
        'writeFile',
        'writeFileSync',
        'appendFile',
        'appendFileSync',
        'chmod',
        'chmodSync',
        'chown',
        'chownSync',
        'cp',
        'cpSync',
        'createWriteStream',
        'mkdir',
        'mkdirSync',
        'rename',
        'renameSync',
        'rm',
        'rmSync',
        'rmdir',
        'rmdirSync',
        'symlink',
        'symlinkSync',
        'truncate',
        'truncateSync',
        'unlink',
        'unlinkSync',
        'write',
        'writev',
    ];
    const { fs } = (0, memfs_1.memfs)({ [process.cwd()]: {} });
    for (let w of writers) {
        if (fs[w]) {
            fsm[w] = fs[w].bind(fs);
        }
    }
    // Also redirect the promise-based writers. fsm.promises is shared by
    // reference with the real fs module, so replace it with a copy rather
    // than mutating the caller's fs.
    const memPromises = fs.promises;
    if (fsm.promises && memPromises) {
        const promises = { ...fsm.promises };
        for (let w of writers) {
            if ('function' === typeof memPromises[w]) {
                promises[w] = memPromises[w].bind(memPromises);
            }
        }
        ;
        fsm.promises = promises;
    }
    return fsm;
}
//# sourceMappingURL=model.js.map