"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Val = exports.Build = void 0;
const aontu_1 = require("aontu");
Object.defineProperty(exports, "Val", { enumerable: true, get: function () { return aontu_1.Val; } });
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
        this.res = spec.res || [];
        Object.assign(this.use, spec.use || {});
    }
    async run() {
        console.log('BUILDING ', this.path, new Date() + ' ...');
        this.root = (0, aontu_1.Aontu)(this.src, this.opts);
        let nil = this.root;
        console.log('MODEL: ' + (nil.nil ? nil.why : 'ok'));
        console.log('MODEL ERR', this.root.err);
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