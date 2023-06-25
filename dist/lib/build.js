"use strict";
/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Build = void 0;
const aontu_1 = require("aontu");
class Build {
    constructor(spec) {
        this.root = aontu_1.Nil.make();
        this.use = {};
        this.err = [];
        this.spec = spec;
        this.src = spec.src;
        this.base = null == spec.base ? '' : spec.base;
        this.path = null == spec.path ? '' : spec.path;
        this.opts = {};
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
    async run() {
        let hasErr = false;
        this.root = (0, aontu_1.Aontu)(this.src, this.opts);
        hasErr = this.root.err && 0 < this.root.err.length;
        if (hasErr) {
            this.err.push(...this.root.err);
        }
        let brlog = [];
        if (!hasErr) {
            let genctx = new aontu_1.Context({ root: this.root });
            this.model = this.root.gen(genctx);
            hasErr = genctx.err && 0 < genctx.err.length;
            if (hasErr) {
                this.err.push(...genctx.err);
            }
            else {
                // TODO: only call if path value has changed
                for (let builder of this.res) {
                    try {
                        let br = await builder.build(this);
                        br.path = builder.path;
                        br.builder = builder.build.name;
                        brlog.push(br);
                    }
                    catch (e) {
                        this.err.push(e);
                    }
                }
            }
        }
        return { ok: !hasErr, build: this, builders: brlog, err: this.err };
    }
}
exports.Build = Build;
//# sourceMappingURL=build.js.map