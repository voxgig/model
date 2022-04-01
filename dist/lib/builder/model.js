"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.model_builder = void 0;
const promises_1 = require("fs/promises");
const model_builder = async (build) => {
    let json = JSON.stringify(build.root.gen(), null, 2);
    let file = build.opts.base + '/model.json';
    // console.log('MODEL OUT', file, json)
    await (0, promises_1.writeFile)(file, json);
    return { ok: true };
};
exports.model_builder = model_builder;
//# sourceMappingURL=model.js.map