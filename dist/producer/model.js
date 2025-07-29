"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.model_producer = void 0;
const path_1 = __importDefault(require("path"));
// Builds the main model file, after unification.
const model_producer = async (build, ctx) => {
    let pr = {
        ok: true,
        name: 'model',
        reload: false,
        step: ctx.step,
        active: true,
        errs: [],
        runlog: []
    };
    if ('post' !== ctx.step) {
        return pr;
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
    build.fs.mkdirSync(path_1.default.dirname(file), { recursive: true });
    build.fs.writeFileSync(file, json);
    return pr;
};
exports.model_producer = model_producer;
//# sourceMappingURL=model.js.map