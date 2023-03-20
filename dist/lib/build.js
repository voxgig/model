"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Build = void 0;
const aontu_1 = require("aontu");
class Build {
    constructor(spec) {
        this.root = aontu_1.Nil.make();
        this.use = {};
        this.spec = spec;
        this.src = spec.src;
        this.base = null == spec.base ? '' : spec.base;
        this.path = null == spec.path ? '' : spec.path;
        this.opts = {};
        if (null != spec.base) {
            this.opts.base = spec.base;
        }
        if (null != spec.require) {
            this.opts.require = spec.require;
        }
        this.res = spec.res || [];
        Object.assign(this.use, spec.use || {});
    }
    async run() {
        console.log('BUILDING ', this.path, new Date() + ' ...');
        this.root = (0, aontu_1.Aontu)(this.src, this.opts);
        let nil = this.root;
        console.log('MODEL: ' + (nil.nil ? nil.why : 'ok'));
        if (this.root.err) {
            console.log('MODEL ERR');
            console.dir(this.root.err, { depth: null });
        }
        this.model = this.root.gen();
        // TODO: only call if path value has changed
        let brlog = [];
        for (let builder of this.res) {
            let br = await builder.build(this);
            br.path = builder.path;
            br.builder = builder.build.name;
            brlog.push(br);
        }
        return { ok: true, build: this, builders: brlog };
    }
}
exports.Build = Build;
//# sourceMappingURL=build.js.map