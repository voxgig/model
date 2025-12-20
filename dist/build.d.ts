import { Aontu } from 'aontu';
import type { Build, BuildResult, BuildContext, BuildSpec, RunSpec, Log, ProducerDef } from './types';
declare class BuildImpl implements Build {
    id: string;
    base: string;
    path: string;
    opts: any;
    pdef: ProducerDef[];
    spec: BuildSpec;
    model: any;
    use: {};
    errs: any[];
    ctx: BuildContext;
    log: Log;
    fs: any;
    dryrun: boolean;
    args: any;
    aontu: Aontu;
    deps: any;
    constructor(spec: BuildSpec, log: Log);
    run(rspec: RunSpec): Promise<BuildResult>;
    resolveModel(): Promise<boolean>;
}
declare function makeBuild(spec: BuildSpec, log: Log): BuildImpl;
export { makeBuild, BuildSpec, };
