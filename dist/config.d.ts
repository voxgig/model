import type { BuildResult, BuildSpec, Log } from './types';
import { Watch } from './watch';
declare class Config {
    build: any;
    watch: Watch;
    log: Log;
    constructor(spec: BuildSpec, log: Log);
    run(): Promise<BuildResult>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export { Config, BuildSpec };
