"use strict";
/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Watch = void 0;
const node_path_1 = __importDefault(require("node:path"));
const build_1 = require("./build");
const chokidar_1 = require("chokidar");
const promises_1 = require("fs/promises");
class Watch {
    constructor(spec) {
        this.spec = spec;
        this.fsw = new chokidar_1.FSWatcher();
        this.last_change_time = 0;
        const run = this.run.bind(this);
        this.fsw.on('change', () => {
            // Avoid rebuilding when, for example, TS rewrites all files in dist
            if (55 < Date.now() - this.last_change_time) {
                run();
            }
        });
    }
    add(file) {
        if (!node_path_1.default.isAbsolute(file)) {
            file = node_path_1.default.join(this.spec.require, file);
        }
        // console.log('WATCH ADD', file)
        this.fsw.add(file);
    }
    update(br) {
        // console.log('BUILD RESULT', br)
        let build = br.build;
        let files = Object.keys(build.root.deps).reduce((files, target) => {
            files = files.concat(Object.keys(build.root.deps[target]));
            return files;
        }, [build.path]);
        // TODO: remove deleted files
        files.forEach((file) => {
            if ('string' === typeof (file) &&
                '' !== file &&
                build.opts.base !== file) {
                this.fsw.add(file);
            }
        });
        // setTimeout(() => {
        //   console.log('WATCH', this.fsw.getWatched())
        // }, 100)
    }
    async start() {
        await this.run(false);
    }
    async run(once) {
        var _a, _b;
        this.last_change_time = Date.now();
        console.log('\n@voxgig/model', new Date(this.last_change_time));
        // TODO: build spec should not have src!
        let src = (await (0, promises_1.readFile)(this.spec.path)).toString();
        this.spec.src = src;
        let build = new build_1.Build(this.spec);
        let br = await build.run();
        console.log('\nFILES:\n' + this.descDeps(br.build.root.deps) + '\n');
        if (br.ok) {
            console.log('TOP:', Object.keys((_a = br === null || br === void 0 ? void 0 : br.build) === null || _a === void 0 ? void 0 : _a.model).join(', '), '\n');
            if (!once) {
                // There may be new files.
                this.update(br);
            }
        }
        else {
            console.log('MODEL ERRORS: ' + ((_b = br.err) === null || _b === void 0 ? void 0 : _b.length));
            this.handleErrors(br);
        }
        this.last = br;
        return br;
    }
    async stop() {
        await this.fsw.close();
    }
    handleErrors(br) {
        if (br.err) {
            for (let be of br.err) {
                if (be.msg) {
                    console.log(be.msg);
                }
                else if (be.message) {
                    console.log(be.message);
                }
                else {
                    console.log(be);
                }
            }
        }
    }
    descDeps(deps) {
        let desc = [];
        for (let entryPath of Object.keys(deps)) {
            desc.push('  ' + entryPath);
            for (let depPath of Object.keys(deps[entryPath])) {
                desc.push('    ' + depPath);
            }
        }
        return desc.join('\n');
    }
}
exports.Watch = Watch;
//# sourceMappingURL=watch.js.map