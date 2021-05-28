import { Val } from 'aontu';
interface BuildResult {
    ok: boolean;
    builder?: string;
    path?: string;
    build?: Build;
    builders?: BuildResult[];
}
interface BuildAction {
    path: string;
    build: Builder;
}
declare type Builder = (build: Build) => Promise<BuildResult>;
interface Spec {
    src: string;
    path?: string;
    base?: string;
    res?: BuildAction[];
    use?: {
        [name: string]: any;
    };
}
declare class Build {
    src: string;
    base: string;
    path: string;
    root: Val;
    opts: {
        [key: string]: any;
    };
    res: BuildAction[];
    spec: Spec;
    model: any;
    use: {
        [name: string]: any;
    };
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
}
export { Build, Builder, BuildResult, BuildAction, Spec, Val };
