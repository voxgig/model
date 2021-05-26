import { BuildResult } from './build';
import { FSWatcher } from 'chokidar';
declare class Watch {
    fsw: FSWatcher;
    spec: any;
    constructor(spec: any);
    update(br: BuildResult): void;
    start(): Promise<void>;
    run(once: boolean): Promise<BuildResult>;
    stop(): Promise<void>;
}
export { Watch };
