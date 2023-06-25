"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.local_builder = void 0;
const path_1 = __importDefault(require("path"));
const local_builder = async (build) => {
    try {
        // TODO: need to provide project root via build
        let root = path_1.default.resolve(build.path, '..', '..');
        // TODO: build should do this
        // console.log('LOCAL root:', root)
        let configbuild = build.use.config;
        let config = configbuild.watch.last.build.model;
        // console.log('CONFIG BUILD')
        // console.dir(config, { depth: null })
        let builders = config.sys.model.builders;
        let ok = true;
        let brlog = [];
        // TODO: order by comma sep string
        for (let name in builders) {
            let builder = builders[name];
            let action_path = path_1.default.join(root, builder.load);
            // TODO: need to watch these files too, and their deps!
            // console.log('ACTION PATH', name, action_path)
            let action = require(action_path);
            let br = await action(build.model, build);
            ok = ok && null != br && br.ok;
            brlog.push(br);
        }
        return { ok: ok, brlog };
    }
    catch (e) {
        console.log('MODEL BUILD local', e);
        throw e;
    }
};
exports.local_builder = local_builder;
//# sourceMappingURL=local.js.map