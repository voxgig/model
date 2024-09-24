import type { Build, BuildResult } from './types';
import { FSWatcher } from 'chokidar';
type Run = {
    canon: string;
    path: string;
    start: number;
    end: number;
};
type Canon = {
    path: string;
    isFolder: boolean;
    when: number;
};
declare class Watch {
    fsw: FSWatcher;
    spec: any;
    last?: BuildResult;
    last_change_time: number;
    build: Build | undefined;
    runq: Run[];
    doneq: Run[];
    canons: Canon[];
    running: boolean;
    constructor(spec: any);
    drain(): Promise<void>;
    add(path: string): Promise<void>;
    canon(path: string): string;
    update(br: BuildResult): Promise<void>;
    start(): Promise<BuildResult>;
    run(once?: boolean, trigger?: string): Promise<BuildResult>;
    stop(): Promise<void>;
    handleErrors(br: BuildResult): void;
    descDeps(deps: Record<string, Record<string, {
        tar: string;
    }>>): string;
}
export { Watch };
