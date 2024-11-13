import type { Build, BuildResult, Log, Run, Canon, ChangeItem, BuildSpec } from './types';
import { FSWatcher } from 'chokidar';
declare class Watch {
    fsw: FSWatcher;
    wspec: any;
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
    log: Log;
    name: string;
    constructor(wspec: BuildSpec, log: Log);
    start(): void;
    canon(path: string): string;
    handleChange(path: string): void;
    drain(): Promise<void>;
    add(path: string): Promise<void>;
    update(br: BuildResult): Promise<void>;
    run(name: string, once?: boolean, trigger?: string): Promise<BuildResult>;
    stop(): Promise<void>;
    handleErrors(br: BuildResult): void;
    descDeps(deps: Record<string, Record<string, {
        tar: string;
    }>>): string;
}
export { Watch };
