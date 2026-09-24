import type { BuildResult, BuildSpec, Log } from './types';
import { Watch } from './watch';
declare const CONFIG_FILE = "model-config.aontu";
declare const LEGACY_CONFIG_FILE = "model-config.aon";
declare class Config {
    build: BuildSpec;
    watch: Watch;
    log: Log;
    constructor(spec: BuildSpec, log: Log);
    run(watch: boolean): Promise<BuildResult>;
    start(initial?: boolean): Promise<void>;
    stop(): Promise<void>;
}
declare function prepareConfig(fs: any, cbase: string, log: Log, dryrun?: boolean): string | undefined;
declare function readBack(fs: any, path: string, src: string): any;
declare function rewriteAonIncludes(src: string): string;
export { Config, BuildSpec, CONFIG_FILE, LEGACY_CONFIG_FILE, prepareConfig, readBack, rewriteAonIncludes, };
