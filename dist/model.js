"use strict";
/* Copyright © 2021-2022 Voxgig Ltd, MIT License. */
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
const intern = makeIntern();
class Model {
    constructor(spec) {
        this.trigger_model = false;
        this.config = intern.makeConfig(spec, {
            path: '/',
            build: async (build) => {
                console.log('TRIGGER MODEL', this.trigger_model);
                if (this.trigger_model) {
                    console.log('CONFIG CHANGE'); //, this)
                    // console.trace()
                    // rebuild if config changes
                    // TODO: fix!!!
                    this.build.use.config.watch.last.build = build;
                    return this.watch.run(true);
                }
                else {
                    this.trigger_model = true;
                    return { ok: true };
                }
            }
        });
        this.build = {
            src: spec.src,
            path: spec.path,
            base: spec.base,
            use: { config: this.config },
            res: [
                {
                    path: '/',
                    build: model_1.model_builder
                },
                {
                    path: '/',
                    build: local_1.local_builder
                }
            ]
        };
        this.watch = new watch_1.Watch(this.build);
    }
    async run() {
        this.trigger_model = false;
        let br = await this.config.run();
        return br.ok ? this.watch.run(true) : br;
    }
    async start() {
        console.log('MODEL START');
        this.trigger_model = false;
        await this.config.start();
        return this.watch.start();
    }
    async stop() {
        return this.watch.stop();
    }
}
exports.Model = Model;
function makeIntern() {
    return {
        makeConfig(spec, trigger_model_build) {
            let cbase = spec.base + '/config';
            let cpath = cbase + '/config.jsonic';
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
                    trigger_model_build
                ]
            };
            return new config_1.Config(cspec);
        }
    };
}
//# sourceMappingURL=model.js.map