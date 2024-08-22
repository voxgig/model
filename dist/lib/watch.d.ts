import type { Build, BuildResult } from './types';
import { FSWatcher } from 'chokidar';
declare class Watch {
    fsw: FSWatcher;
    spec: any;
    last?: BuildResult;
    last_change_time: number;
    build: Build | undefined;
    constructor(spec: any);
    add(file: string): void;
    update(br: BuildResult): void;
    start(): Promise<BuildResult>;
    run(once?: boolean): Promise<BuildResult>;
    stop(): Promise<void>;
    handleErrors(br: BuildResult): void;
    descDeps(deps: Record<string, Record<string, {
        tar: string;
    }>>): string;
}
export { Watch };
