"use strict";
/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const watch_1 = require("./watch");
class Config {
    constructor(spec, log) {
        this.log = log;
        this.build = {
            path: spec.path,
            base: spec.base,
            res: [
                ...(spec.res || [])
            ],
            require: spec.require,
            log: this.log,
            fs: spec.fs
        };
        this.watch = new watch_1.Watch(this.build, this.log);
    }
    async run(watch) {
        return this.watch.run('config', watch, '<config>');
    }
    async start() {
        return this.watch.start();
    }
    async stop() {
        return this.watch.stop();
    }
}
exports.Config = Config;
//# sourceMappingURL=config.js.map