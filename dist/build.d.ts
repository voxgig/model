import { Val } from 'aontu';
import type { Build, BuildResult, BuildAction, BuildContext, BuildSpec, Log } from './types';
declare class BuildImpl implements Build {
    id: string;
    src: string;
    base: string;
    path: string;
    root: any;
    opts: any;
    res: BuildAction[];
    spec: BuildSpec;
    model: any;
    use: {};
    err: any[];
    ctx: BuildContext;
    log: Log;
    constructor(spec: BuildSpec, log: Log);
    run(): Promise<BuildResult>;
}
declare function makeBuild(spec: BuildSpec, log: Log): BuildImpl;
export { makeBuild, BuildSpec, Val };
