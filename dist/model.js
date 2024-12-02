"use strict";
/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const util_1 = require("@voxgig/util");
const config_1 = require("./config");
const watch_1 = require("./watch");
const model_1 = require("./builder/model");
const local_1 = require("./builder/local");
class Model {
    constructor(mspec) {
        this.trigger_model = false;
        const self = this;
        self.fs = mspec.fs || node_fs_1.default;
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
                if ('post' !== ctx.step) {
                    return { ok: true, errs: [], runlog: [] };
                }
                let res = { ok: false, errs: [], runlog: [] };
                if (self.trigger_model) {
                    // TODO: better design
                    if (self.build.use) {
                        self.build.use.config.watch.last.build = build;
                    }
                    res = await self.watch.run('model', true);
                }
                else {
                    self.trigger_model = true;
                    res = { ok: true, errs: [], runlog: [] };
                }
                if (ctx.watch) {
                    const watchmap = build.model?.sys?.model?.watch;
                    if (watchmap) {
                        Object.keys(watchmap).map((file) => {
                            self.watch.add(file);
                        });
                    }
                }
                return res;
            }
        });
        // The actual model.
        this.build = {
            path: mspec.path,
            base: mspec.base,
            debug: mspec.debug,
            use: { config: self.config },
            res: [
                {
                    path: '/',
                    build: model_1.model_builder
                },
                {
                    path: '/',
                    build: local_1.local_builder
                }
            ],
            require: mspec.require,
            log: this.log,
            fs: this.fs
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
    /*
    try {
      src = Fs.readFileSync(cpath).toString()
    }
    catch (err: any) {
      log.error({
        fail: 'read-file', point: 'model-config', path: cpath, err
      })
      throw err
    }
    */
    let cspec = {
        name: 'config',
        path: cpath,
        base: cbase,
        debug: mspec.debug,
        res: [
            // Generate full config model and save as a file.
            {
                path: '/',
                build: model_1.model_builder
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
//# sourceMappingURL=model.js.map