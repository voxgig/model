"use strict";
/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.camelify = exports.pinify = exports.get = exports.joins = exports.dive = exports.Model = void 0;
// TODO: remove need for this
const fs_1 = __importDefault(require("fs"));
const config_1 = require("./lib/config");
const watch_1 = require("./lib/watch");
const model_1 = require("./lib/builder/model");
const local_1 = require("./lib/builder/local");
const util_1 = require("./lib/util");
Object.defineProperty(exports, "dive", { enumerable: true, get: function () { return util_1.dive; } });
Object.defineProperty(exports, "joins", { enumerable: true, get: function () { return util_1.joins; } });
Object.defineProperty(exports, "get", { enumerable: true, get: function () { return util_1.get; } });
Object.defineProperty(exports, "pinify", { enumerable: true, get: function () { return util_1.pinify; } });
Object.defineProperty(exports, "camelify", { enumerable: true, get: function () { return util_1.camelify; } });
const intern = makeIntern();
class Model {
    constructor(spec) {
        this.trigger_model = false;
        // Config is a special Watch to handle model config.
        this.config = intern.makeConfig(spec, {
            path: '/',
            build: async (build) => {
                if (this.trigger_model) {
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
        // The actual model.
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
            ],
            require: spec.require
        };
        this.watch = new watch_1.Watch(this.build);
    }
    async run() {
        this.trigger_model = false;
        let br = await this.config.run();
        return br.ok ? this.watch.run(true) : br;
    }
    async start() {
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
                    trigger_model_build
                ],
                require: spec.require
            };
            return new config_1.Config(cspec);
        }
    };
}
//# sourceMappingURL=model.js.map