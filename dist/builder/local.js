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
        actionDefs = ctx.state.local.actionDefs = [];
        // TODO: need to provide project root via build
        let root = path_1.default.resolve(build.path, '..', '..');
        // TODO: build should do this
        let configBuildResult = build.use.config.watch.last;
        let configBuild = configBuildResult?.build();
        let config = configBuild?.model || {};
        let builders = config.sys?.model.builders || {};
        // console.log('LOCAL BUILDERS', builders)
        // TODO: order by comma sep string
        // Load builders
        for (let name in builders) {
            let builder = builders[name];
            let action_path = path_1.default.join(root, builder.load);
            let action = require(action_path);
            if (action instanceof Promise) {
                action = await action;
            }
            const step = action.step || 'post';
            actionDefs.push({ name, builder, action, step });
        }
        // console.log('LOCAL ACTION DEFS', actionDefs)
    }
    const runActionDefs = actionDefs.filter((ad) => ctx.step === ad.step || 'all' === ad.step);
    build.log.info({
        point: ctx.step + '-actions', step: ctx.step, actions: runActionDefs,
        note: runActionDefs.map((ad) => ad.name).join(';')
    });
    let ok = true;
    let areslog = [];
    for (let actionDef of runActionDefs) {
        try {
            let ares = await actionDef.action(build.model, build, ctx);
            ok = ok && (null == ares || !!ares.ok);
            areslog.push(ares);
            console.log('ARES', ares);
            if (!ok) {
                break;
            }
        }
        catch (err) {
            if (!err.__logged__) {
                build.log.error({
                    point: ctx.step + '-action', step: ctx.step, action: actionDef,
                    note: actionDef.name,
                    err
                });
                err.__logged__ = true;
            }
            throw err;
        }
    }
    return { ok, step: ctx.step, active: true, errs: [], runlog: [] };
};
exports.local_builder = local_builder;
//# sourceMappingURL=local.js.map