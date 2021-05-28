import { BuildResult, Spec } from './build';
import { Watch } from './watch';
declare class Config {
    build: any;
    watch: Watch;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export { Config, Spec };
