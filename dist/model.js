"use strict";
/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
// TODO: remove need for this
const node_fs_1 = __importDefault(require("node:fs"));
const util_1 = require("@voxgig/util");
const config_1 = require("./config");
const watch_1 = require("./watch");
const model_1 = require("./builder/model");
const local_1 = require("./builder/local");
class Model {
    constructor(spec) {
        this.trigger_model = false;
        const self = this;
        const pino = (0, util_1.prettyPino)('model', spec);
        this.log = pino.child({ cmp: 'model' });
        this.log.info({ point: 'model-init' });
        this.log.debug({
            point: 'model-spec', spec, note: '\n' +
                JSON.stringify({ ...spec, src: '<NOT-SHOWN>' }, null, 2)
                    .replace(/"/g, '')
                    .replaceAll(process.cwd(), '.')
        });
        // Config is a special Watch to handle model config.
        this.config = makeConfig(spec, this.log, {
            path: '/',
            build: async function trigger_model(build, ctx) {
                if ('post' !== ctx.step) {
                    return { ok: true };
                }
                let res;
                // console.log('TRIGGER', build.id, self.trigger_model, ctx)
                // console.log(new Error().stack)
                if (self.trigger_model) {
                    // TODO: better design
                    if (self.build.use) {
                        self.build.use.config.watch.last.build = build;
                    }
                    res = self.watch.run('model', true);
                }
                else {
                    self.trigger_model = true;
                    res = { ok: true };
                }
                const watchmap = build.model?.sys?.model?.watch;
                if (watchmap) {
                    Object.keys(watchmap).map((file) => {
                        self.watch.add(file);
                    });
                }
                return res;
            }
        });
        // The actual model.
        this.build = {
            src: spec.src,
            path: spec.path,
            base: spec.base,
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
            require: spec.require,
            log: this.log,
        };
        this.watch = new watch_1.Watch(self.build, this.log);
    }
    async run() {
        this.trigger_model = false;
        const br = await this.config.run();
        return br.ok ? this.watch.run('model', true) : br;
    }
    async start() {
        this.trigger_model = false;
        const br = await this.config.run();
        // console.log('MODEL CONFIG START', br.ok)
        return br.ok ? this.watch.start() : br;
    }
    async stop() {
        return this.watch.stop();
    }
}
exports.Model = Model;
function makeConfig(spec, log, trigger_model_build) {
    let cbase = spec.base + '/.model-config';
    let cpath = cbase + '/model-config.jsonic';
    // Build should load file
    let src = node_fs_1.default.readFileSync(cpath).toString();
    let cspec = {
        name: 'config',
        src: src,
        path: cpath,
        base: cbase,
        res: [
            // Generate full config model and save as a file.
            {
                path: '/',
                build: model_1.model_builder
            },
            // Trigger main model build.
            trigger_model_build
        ],
        require: spec.require,
        log,
    };
    return new config_1.Config(cspec, log);
}
//# sourceMappingURL=model.js.map