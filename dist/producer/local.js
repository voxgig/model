"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.local_producer = void 0;
const path_1 = __importDefault(require("path"));
// Runs any producers local to the repo.
const local_producer = async (build, ctx) => {
    console.log('LOCAL', 'ctx:' + ctx.step);
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
        let actions = config.sys?.model?.action ||
            // NOTE: backwards compat
            config.sys?.model?.builders ||
            {};
        let ordering = config.sys?.model?.order?.action;
        ordering = null == ordering ? Object.keys(actions) :
            ordering.split(/\s*,+\s*/).filter((n) => null != n && '' != n);
        // load actions
        for (let name of ordering) {
            let actiondef = actions[name];
            let actionpath = path_1.default.join(root, actiondef.load);
            let action = require(actionpath);
            if (action instanceof Promise) {
                action = await action;
            }
            const step = action.step || 'post';
            actionDefs.push({ name, actiondef, action, step });
        }
    }
    const runActionDefs = actionDefs.filter((ad) => ctx.step === ad.step || 'all' === ad.step);
    build.log.info({
        point: ctx.step + '-actions', step: ctx.step, actions: runActionDefs,
        note: runActionDefs.map((ad) => ad.name).join(';')
    });
    let ok = true;
    let areslog = [];
    let reload = false;
    for (let actionDef of runActionDefs) {
        try {
            // TODO: this call signature needs to be well-defined as it is an external interface
            let ares = await actionDef.action(build.model, build, ctx);
            ok = ok && (null == ares || !!ares.ok);
            reload = reload || ares?.reload;
            areslog.push(ares);
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
    let pr = {
        ok,
        reload,
        name: 'local',
        step: ctx.step,
        active: true,
        errs: [],
        runlog: []
    };
    return pr;
};
exports.local_producer = local_producer;
//# sourceMappingURL=local.js.map