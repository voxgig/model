import type { BuildResult, BuildSpec, Log } from './types';
import { Watch } from './watch';
declare class Config {
    build: BuildSpec;
    watch: Watch;
    log: Log;
    constructor(spec: BuildSpec, log: Log);
    run(watch: boolean): Promise<BuildResult>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export { Config, BuildSpec };
