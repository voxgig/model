"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.model_builder = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = require("fs/promises");
const model_builder = async (build) => {
    try {
        let json = JSON.stringify(build.root.gen(), null, 2);
        let filename = path_1.default.basename(build.path);
        let filenameparts = filename.match(/^(.*)\.[^.]+$/);
        if (filenameparts) {
            filename = filenameparts[1];
        }
        let file = build.opts.base + '/' + filename + '.json';
        await (0, promises_1.writeFile)(file, json);
        return { ok: true };
    }
    catch (e) {
        console.log('MODEL BUILD model', e);
        throw e;
    }
};
exports.model_builder = model_builder;
//# sourceMappingURL=model.js.map