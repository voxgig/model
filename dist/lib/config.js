"use strict";
/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const watch_1 = require("./watch");
class Config {
    constructor(spec) {
        this.build = {
            src: spec.src,
            path: spec.path,
            base: spec.base,
            res: [
                ...(spec.res || [])
            ],
            require: spec.require
        };
        this.watch = new watch_1.Watch(this.build);
    }
    async run() {
        return this.watch.run(true, '<config>');
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