"use strict";
/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeBuild = makeBuild;
const aontu_1 = require("aontu");
class BuildImpl {
    constructor(spec, log) {
        this.use = {};
        this.errs = [];
        this.id = String(Math.random()).substring(3, 9);
        this.log = log;
        this.spec = spec;
        this.dryrun = !!spec.dryrun;
        this.args = spec.buildargs;
        this.fs = spec.fs;
        this.base = null == spec.base ? '' : spec.base;
        this.path = null == spec.path ? '' : spec.path;
        this.opts = {};
        this.ctx = { step: 'pre', watch: false, state: {} };
        if (null != spec.base) {
            this.opts.base = spec.base;
            this.opts.path = spec.path;
        }
        if (null != spec.require) {
            this.opts.require = spec.require;
        }
        this.pdef = spec.res || [];
        Object.assign(this.use, spec.use || {});
        this.deps = {};
        this.aontu = new aontu_1.Aontu();
    }
    async run(rspec) {
        let hasErr = false;
        let runlog = [];
        this.ctx = { step: 'pre', state: {}, watch: rspec.watch };
        const plog = [];
        if (!hasErr) {
            runlog.push('model:initial');
            hasErr = await this.resolveModel();
        }
        let forceReload = false;
        if (!hasErr) {
            for (let producer of this.pdef) {
                try {
                    runlog.push('producer:pre:' + producer.build.name);
                    let pr = await producer.build(this, this.ctx);
                    forceReload = forceReload || pr.reload;
                    plog.push(pr);
                    if (!pr.ok) {
                        hasErr = true;
                        break;
                    }
                }
                catch (err) {
                    hasErr = true;
                    this.errs.push(err);
                    break;
                }
            }
        }
        // Reload after pre production since model files may have been modified.
        const reload = forceReload || !hasErr;
        // TODO: only reload if mode changed
        if (reload) {
            runlog.push('model:full');
            hasErr = await this.resolveModel();
        }
        if (!hasErr) {
            this.ctx.step = 'post';
            for (let producer of this.pdef) {
                try {
                    runlog.push('producer:post:' + producer.build.name);
                    let pr = await producer.build(this, this.ctx);
                    plog.push(pr);
                    if (!pr.ok) {
                        hasErr = true;
                        break;
                    }
                }
                catch (err) {
                    hasErr = true;
                    this.errs.push(err);
                    break;
                }
            }
        }
        const br = {
            // TODO: remove need for this
            build: () => this,
            ok: !hasErr,
            producers: plog,
            errs: this.errs,
            runlog
        };
        return br;
    }
    async resolveModel() {
        let hasErr = false;
        let src = '';
        if (!hasErr) {
            try {
                src = this.fs.readFileSync(this.path, 'utf8');
            }
            catch (err) {
                hasErr = true;
                this.errs.push(err);
            }
        }
        if (!hasErr) {
            this.opts.errs = this.errs;
            this.opts.deps = this.deps;
            this.opts.fs = this.fs;
            this.model = this.aontu.generate(src, this.opts);
            hasErr = this.opts.errs && 0 < this.opts.errs.length;
        }
        return hasErr;
    }
}
function makeBuild(spec, log) {
    return new BuildImpl(spec, log);
}
//# sourceMappingURL=build.js.map