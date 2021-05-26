"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Model = void 0;
const watch_1 = require("./lib/watch");
const model_1 = require("./lib/builder/model");
class Model {
    constructor(spec) {
        this.build = {
            src: spec.src,
            path: spec.path,
            base: spec.base,
            res: [
                {
                    path: '/',
                    build: model_1.model_builder
                },
            ]
        };
        this.watch = new watch_1.Watch(this.build);
    }
    async run() {
        return this.watch.run(true);
    }
    async start() {
        return this.watch.start();
    }
    async stop() {
        return this.watch.stop();
    }
}
exports.Model = Model;
//# sourceMappingURL=model.js.map