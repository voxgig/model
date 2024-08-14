"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.local_builder = void 0;
const path_1 = __importDefault(require("path"));
// Runs any builders local to the repo.
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
            // console.log('LOCAL BUILDER', name)
            let builder = builders[name];
            let action_path = path_1.default.join(root, builder.load);
            // TODO: need to watch these files too, and their deps!
            console.log('ACTION PATH 1', name, action_path);
            clear(action_path);
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
// Adapted from https://github.com/sindresorhus/import-fresh - Thanks!
function clear(path) {
    let filePath = require.resolve(path);
    // console.log('CM fp', filePath)
    if (require.cache[filePath]) {
        const children = require.cache[filePath].children.map(child => child.id);
        // console.log('CM-B', filePath, children)
        // Delete module from cache
        delete require.cache[filePath];
        for (const id of children) {
            clear(id);
        }
    }
    if (require.cache[filePath] && require.cache[filePath].parent) {
        let i = require.cache[filePath].parent.children.length;
        // console.log('CM-A', filePath, require.cache[filePath].parent.children)
        while (i--) {
            if (require.cache[filePath].parent.children[i].id === filePath) {
                require.cache[filePath].parent.children.splice(i, 1);
            }
        }
    }
}
//# sourceMappingURL=local.js.map