"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.model_builder = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = require("fs/promises");
// Builds the main model file, after unification.
const model_builder = async (build, ctx) => {
    if ('post' !== ctx.step) {
        return { ok: true, step: ctx.step, active: false, errs: [], runlog: [] };
    }
    let json = JSON.stringify(build.model, null, 2);
    let filename = path_1.default.basename(build.path);
    let filenameparts = filename.match(/^(.*)\.[^.]+$/);
    if (filenameparts) {
        filename = filenameparts[1];
    }
    let file = build.opts.base + '/' + filename + '.json';
    build.log.info({
        point: 'write-model',
        path: file,
        note: file.replace(process.cwd(), '.')
    });
    await (0, promises_1.writeFile)(file, json);
    return { ok: true, step: ctx.step, active: true, errs: [], runlog: [] };
};
exports.model_builder = model_builder;
//# sourceMappingURL=model.js.map