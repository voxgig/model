"use strict";
/* Copyright © 2021-2024 Voxgig Ltd, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeBuild = makeBuild;
const aontu_1 = require("aontu");
class BuildImpl {
    constructor(spec, log) {
        this.root = aontu_1.Nil.make();
        this.use = {};
        this.errs = [];
        this.id = String(Math.random()).substring(3, 9);
        this.log = log;
        this.spec = spec;
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
        this.res = spec.res || [];
        Object.assign(this.use, spec.use || {});
    }
    async run(rspec) {
        let hasErr = false;
        let runlog = [];
        // console.log('BUILD RUN RES', this.res)
        this.ctx = { step: 'pre', state: {}, watch: rspec.watch };
        const brlog = [];
        if (!hasErr) {
            runlog.push('model:initial');
            hasErr = await this.resolveModel();
            // console.log('MODEL', this.path, hasErr, rspec, this.errs)
        }
        if (!hasErr) {
            for (let builder of this.res) {
                try {
                    runlog.push('builder:pre:' + builder.build.name);
                    let br = await builder.build(this, this.ctx);
                    br.step = this.ctx.step;
                    br.path = builder.path;
                    br.builder = builder.build.name;
                    brlog.push(br);
                    if (!br.ok) {
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
        // TODO: only reload if mode changed
        if (!hasErr) {
            runlog.push('model:full');
            hasErr = await this.resolveModel();
        }
        if (!hasErr) {
            this.ctx.step = 'post';
            for (let builder of this.res) {
                try {
                    runlog.push('builder:post:' + builder.build.name);
                    let br = await builder.build(this, this.ctx);
                    br.step = this.ctx.step;
                    br.path = builder.path;
                    br.builder = builder.build.name;
                    brlog.push(br);
                    if (!br.ok) {
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
            builders: brlog,
            errs: this.errs,
            runlog
        };
        // console.log('BUILD RESULT', br.ok, br.runlog)
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
            this.root = (0, aontu_1.Aontu)(src, this.opts);
            hasErr = this.root.err && 0 < this.root.err.length;
            if (hasErr) {
                this.errs.push(...this.root.err);
                // console.log('AONTU PARSE ERRS', this.errs)
            }
        }
        if (!hasErr) {
            let genctx = new aontu_1.Context({ root: this.root });
            this.model = this.root.gen(genctx);
            // console.log('AAA', Object.keys(this.model.main?.api?.entity || {}))
            hasErr = genctx.err && 0 < genctx.err.length;
            if (hasErr) {
                this.errs.push(...genctx.err);
                // console.log('AONTU GEN ERRS', this.errs)
            }
        }
        return hasErr;
    }
}
function makeBuild(spec, log) {
    return new BuildImpl(spec, log);
}
//# sourceMappingURL=build.js.map