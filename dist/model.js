"use strict";
/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
// TODO: remove need for this
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./lib/config");
const watch_1 = require("./lib/watch");
const model_1 = require("./lib/builder/model");
const local_1 = require("./lib/builder/local");
class Model {
    constructor(spec) {
        this.trigger_model = false;
        const self = this;
        // Config is a special Watch to handle model config.
        this.config = makeConfig(spec, {
            path: '/',
            build: async function trigger_model(build, ctx) {
                var _a, _b, _c;
                if ('post' !== ctx.step) {
                    return { ok: true };
                }
                let res;
                // console.log('TRIGGER', build.id, self.trigger_model, ctx)
                // console.log(new Error().stack)
                if (self.trigger_model) {
                    // TODO: fix!!!
                    self.build.use.config.watch.last.build = build;
                    res = self.watch.run(true);
                }
                else {
                    self.trigger_model = true;
                    res = { ok: true };
                }
                const watchmap = (_c = (_b = (_a = build.model) === null || _a === void 0 ? void 0 : _a.sys) === null || _b === void 0 ? void 0 : _b.model) === null || _c === void 0 ? void 0 : _c.watch;
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
            require: spec.require
        };
        this.watch = new watch_1.Watch(self.build);
    }
    async run() {
        this.trigger_model = false;
        const br = await this.config.run();
        return br.ok ? this.watch.run(true) : br;
    }
    async start() {
        this.trigger_model = false;
        const br = await this.config.start();
        return br.ok ? this.watch.start() : br;
    }
    async stop() {
        return this.watch.stop();
    }
}
exports.Model = Model;
function makeConfig(spec, trigger_model_build) {
    let cbase = spec.base + '/.model-config';
    let cpath = cbase + '/model-config.jsonic';
    // Build should load file
    let src = fs_1.default.readFileSync(cpath).toString();
    let cspec = {
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
        require: spec.require
    };
    return new config_1.Config(cspec);
}
//# sourceMappingURL=model.js.map