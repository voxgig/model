"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Watch = void 0;
const build_1 = require("./build");
const chokidar_1 = require("chokidar");
const promises_1 = require("fs/promises");
class Watch {
    constructor(spec) {
        this.spec = spec;
        this.fsw = new chokidar_1.FSWatcher();
        this.fsw.on('change', this.run.bind(this));
    }
    update(br) {
        let build = br.build;
        // TODO: remove dep map building from Aontu 
        //let depmap = (build.root as any).map
        // console.log('DEPMAP', depmap)
        //let files = Object.keys(depmap.url)
        //console.log('DEP FILES', files)
        let files = Object.keys(build.root.deps).reduce((files, target) => {
            files = files.concat(Object.keys(build.root.deps[target]));
            return files;
        }, [build.path]);
        //console.log('DEPS', build.base, files)
        // TODO: remove deleted files
        files.forEach((file) => {
            if ('string' === typeof (file) &&
                '' !== file &&
                build.opts.base !== file) {
                // console.log('ADD', file)
                this.fsw.add(file);
            }
        });
        setTimeout(() => {
            console.log('WATCH', this.fsw.getWatched());
        }, 100);
    }
    async start() {
        await this.run(false);
    }
    async run(once) {
        // TODO: build spec should not have src!
        let src = (await (0, promises_1.readFile)(this.spec.path)).toString();
        this.spec.src = src;
        let build = new build_1.Build(this.spec);
        let br = await build.run();
        if (!once) {
            // There may be new files.
            this.update(br);
        }
        this.last = br;
        console.log('WATCH RUN DONE', this.spec.path, this.last.ok);
        return br;
    }
    async stop() {
        await this.fsw.close();
    }
}
exports.Watch = Watch;
//# sourceMappingURL=watch.js.map