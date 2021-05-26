import { BuildResult } from './lib/build';
import { Watch } from './lib/watch';
interface Spec {
    src: string;
    path: string;
    base: string;
}
declare class Model {
    build: any;
    watch: Watch;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
    start(): Promise<void>;
    stop(): Promise<void>;
}
export { Model, Spec };
