import { BuildResult } from './build';
import { FSWatcher } from 'chokidar';
declare class Watch {
    fsw: FSWatcher;
    spec: any;
    last?: BuildResult;
    last_change_time: number;
    constructor(spec: any);
    add(file: string): void;
    update(br: BuildResult): void;
    start(): Promise<void>;
    run(once?: boolean): Promise<BuildResult>;
    stop(): Promise<void>;
    handleErrors(br: BuildResult): void;
    descDeps(deps: Record<string, Record<string, {
        tar: string;
    }>>): string;
}
export { Watch };
