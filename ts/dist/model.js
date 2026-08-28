"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.initModel = exports.Model = void 0;
const NodeFs = __importStar(require("node:fs"));
const memfs_1 = require("memfs");
const util_1 = require("@voxgig/util");
const config_1 = require("./config");
const watch_1 = require("./watch");
const model_1 = require("./producer/model");
const local_1 = require("./producer/local");
const init_1 = require("./init");
Object.defineProperty(exports, "initModel", { enumerable: true, get: function () { return init_1.initModel; } });
class Model {
    constructor(mspec) {
        this.trigger_model = false;
        const self = this;
        this.fs = { ...(mspec.fs || NodeFs) };
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
                    // TODO: better design
                    // Point the config's last result at the current build so the model
                    // producer reads fresh config state. It must be a thunk to satisfy
                    // BuildResult.build's `() => Build` contract (consumers call it).
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
    let cbase = mspec.base + '/.model-config';
    let cpath = cbase + '/model-config.aon';
    // MIGRATE A LEGACY .aontu CONFIG RATHER THAN WRITING OVER IT. This block
    // CREATES the config when it finds none, so looking only for `.aon` in a
    // project that has a `model-config.aontu` would not read the old file — it
    // would decide there is no config and write a fresh default beside it,
    // silently discarding whatever the project had declared there.
    const legacycpath = cbase + '/model-config.aontu';
    if (!fs.existsSync(cpath) && fs.existsSync(legacycpath)) {
        // NOT A VERBATIM COPY. This package's OWN config moved to .aon in v10, so
        // a legacy config's import of it names a file that no longer ships and the
        // migrated config fails to resolve - `aontu/multisource_not_found:
        // @voxgig/model/model/.model-config/model-config.aontu` - on the first
        // build after upgrading. Renaming the file without retargeting that import
        // just moves the breakage.
        //
        // Only THIS package's import is retargeted, and only where it is an
        // IMPORT. Two things are deliberately left alone:
        //
        //   - a project's own `.aontu` imports, which still name real files on
        //     its disk that nothing here renamed;
        //   - this same pathname held as ordinary string DATA (a note, a
        //     compatibility path in action metadata).
        //
        // Hence the match is anchored to aontu's `@"..."` import syntax, closing
        // quote included, rather than to the bare pathname. Both are declarations
        // the migration exists to preserve, and silently editing one during a
        // one-time migration is precisely the failure this whole block guards
        // against.
        const legacy = fs.readFileSync(legacycpath, 'utf8');
        fs.writeFileSync(cpath, legacy.replace(/@(\s*)"(@voxgig\/model\/[^"]*model-config)\.aontu"/g, '@$1"$2.aon"'));
        try {
            fs.unlinkSync(legacycpath);
        }
        catch (_err) { }
    }
    if (!fs.existsSync(cpath)) {
        fs.mkdirSync(cbase, { recursive: true });
        fs.writeFileSync(cpath, `
@"@voxgig/model/model/.model-config/model-config.aon"

sys: model: action: {}
`);
    }
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
        fs,
    };
    return new config_1.Config(cspec, log);
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