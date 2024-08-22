import { Val } from 'aontu';
import type { Build, BuildResult, BuildAction, BuildContext, Spec } from './types';
declare class BuildImpl implements Build {
    id: string;
    src: string;
    base: string;
    path: string;
    root: any;
    opts: any;
    res: BuildAction[];
    spec: Spec;
    model: any;
    use: {};
    err: any[];
    ctx: BuildContext;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
}
declare function makeBuild(spec: Spec): BuildImpl;
export { makeBuild, Spec, Val };
