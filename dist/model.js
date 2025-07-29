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
exports.Model = void 0;
const NodeFs = __importStar(require("node:fs"));
const memfs_1 = require("memfs");
const util_1 = require("@voxgig/util");
const config_1 = require("./config");
const watch_1 = require("./watch");
const model_1 = require("./producer/model");
const local_1 = require("./producer/local");
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
        this.log.debug({
            point: 'model-spec', mspec, note: '\n' +
                JSON.stringify({ ...mspec, src: '<NOT-SHOWN>' }, null, 2)
                    .replace(/"/g, '')
                    .replaceAll(process.cwd(), '.')
        });
        // Config is a special Watch to handle model config.
        this.config = makeConfig(mspec, this.log, this.fs, {
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
                    if (self.build.use) {
                        self.build.use.config.watch.last.build = build;
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
                        Object.keys(watchmap).map((file) => {
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
            use: { config: self.config },
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
    // Run once.
    async run() {
        this.trigger_model = false;
        const br = await this.config.run(false);
        return br.ok ? this.watch.run('model', false, '<start>') : br;
    }
    // Start watching for file changes. Run once initially.
    async start() {
        this.trigger_model = false;
        const br = await this.config.run(true);
        return br.ok ? this.watch.start() : br;
    }
    async stop() {
        return this.watch.stop();
    }
}
exports.Model = Model;
function makeConfig(mspec, log, fs, trigger_model_build) {
    let cbase = mspec.base + '/.model-config';
    let cpath = cbase + '/model-config.jsonic';
    if (!fs.existsSync(cpath)) {
        fs.mkdirSync(cbase, { recursive: true });
        fs.writeFileSync(cpath, `
@"@voxgig/model/model/.model-config/model-config.jsonic"

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
        'writeFile',
        'writeFileSync',
        'writev',
    ];
    const { fs } = (0, memfs_1.memfs)({ [process.cwd()]: {} });
    for (let w of writers) {
        if (fs[w]) {
            fsm[w] = fs[w].bind(fs);
        }
    }
    return fsm;
}
//# sourceMappingURL=model.js.map