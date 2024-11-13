"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.local_builder = void 0;
const path_1 = __importDefault(require("path"));
// Runs any builders local to the repo.
const local_builder = async (build, ctx) => {
    ctx.state.local = (ctx.state.local || {});
    let actionDefs = ctx.state.local.actionDefs;
    if (null == actionDefs) {
        try {
            actionDefs = ctx.state.local.actionDefs = [];
            // TODO: need to provide project root via build
            let root = path_1.default.resolve(build.path, '..', '..');
            // TODO: build should do this
            let configbuild = build.use.config;
            let config = configbuild.watch.last.build.model;
            let builders = config.sys.model.builders;
            // TODO: order by comma sep string
            // Load builders
            for (let name in builders) {
                let builder = builders[name];
                let action_path = path_1.default.join(root, builder.load);
                // clear(action_path)
                let action = require(action_path);
                if (action instanceof Promise) {
                    action = await action;
                }
                const step = action.step || 'post';
                actionDefs.push({ name, builder, action, step });
            }
        }
        catch (e) {
            throw e;
        }
    }
    const runActionDefs = actionDefs.filter((ad) => ctx.step === ad.step || 'all' === ad.step);
    // console.log(runActionDefs)
    build.log.info({
        point: ctx.step + '-actions', step: ctx.step, actions: runActionDefs,
        note: runActionDefs.map((ad) => ad.name).join(';')
    });
    let ok = true;
    let brlog = [];
    for (let actionDef of runActionDefs) {
        let br = await actionDef.action(build.model, build);
        ok = ok && null != br && br.ok;
        brlog.push(br);
    }
    return { ok: true, step: ctx.step, active: true };
};
exports.local_builder = local_builder;
//# sourceMappingURL=local.js.map