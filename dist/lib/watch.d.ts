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
type ChangeItem = {
    path: string;
    when: number;
};
declare class Watch {
    fsw: FSWatcher;
    spec: any;
    last?: BuildResult;
    lastChangeTime: number;
    build: Build | undefined;
    runq: Run[];
    doneq: Run[];
    canons: Canon[];
    lastrun: Run | undefined;
    idle: number;
    startTime: number;
    running: boolean;
    lastChange: ChangeItem;
    lastTrigger: ChangeItem;
    constructor(spec: any);
    start(): void;
    canon(path: string): string;
    handleChange(path: string): void;
    drain(): Promise<void>;
    add(path: string): Promise<void>;
    update(br: BuildResult): Promise<void>;
    run(once?: boolean, trigger?: string): Promise<BuildResult>;
    stop(): Promise<void>;
    handleErrors(br: BuildResult): void;
    descDeps(deps: Record<string, Record<string, {
        tar: string;
    }>>): string;
}
export { Watch };
