import { Config } from './lib/config';
import { BuildResult, Spec } from './lib/build';
import { Watch } from './lib/watch';
declare class Model {
    config: Config;
    build: any;
    watch: Watch;
    trigger_model: boolean;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export { Model, Spec };
