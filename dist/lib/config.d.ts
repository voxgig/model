import type { BuildResult, Spec } from './types';
import { Watch } from './watch';
declare class Config {
    build: any;
    watch: Watch;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
    start(): Promise<BuildResult>;
    stop(): Promise<void>;
}
export { Config, Spec };
