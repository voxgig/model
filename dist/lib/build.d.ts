import { Val } from 'aontu';
interface BuildResult {
    ok: boolean;
    builder?: string;
    path?: string;
    build?: Build;
    builders?: BuildResult[];
}
declare type Builder = (build: Build) => Promise<BuildResult>;
interface Spec {
    src: string;
    path?: string;
    base?: string;
    res?: {
        path: string;
        build: Builder;
    }[];
}
declare class Build {
    src: string;
    base: string;
    path: string;
    root: Val;
    opts: {
        [key: string]: any;
    };
    res: {
        path: string;
        build: Builder;
    }[];
    spec: Spec;
    model: any;
    constructor(spec: Spec);
    run(): Promise<BuildResult>;
}
export { Build, Builder, BuildResult, Spec, Val };
