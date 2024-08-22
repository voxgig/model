import type { BuildResult, Spec } from './lib/types';
import { Config } from './lib/config';
import { Watch } from './lib/watch';
declare class Model {
    config: Config;
    build: any;
    watch: Watch;
    trigger_model: boolean;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
    start(): Promise<BuildResult>;
    stop(): Promise<void>;
}
export { Model, Spec, };
