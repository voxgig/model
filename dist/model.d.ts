import type { BuildResult, BuildSpec, ModelSpec, Log } from './types';
import { Config } from './config';
import { Watch } from './watch';
declare class Model {
    config: Config;
    build: BuildSpec;
    watch: Watch;
    trigger_model: boolean;
    log: Log;
    fs: any;
    constructor(mspec: ModelSpec);
    run(): Promise<BuildResult>;
    start(): Promise<void | BuildResult>;
    stop(): Promise<void>;
}
export { Model, BuildSpec, };
