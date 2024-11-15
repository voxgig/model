import Pino from 'pino';
type Log = ReturnType<typeof Pino>;
interface Build {
    id: string;
    base: string;
    path: string;
    root: any;
    opts: {
        [key: string]: any;
    };
    res: BuildAction[];
    spec: BuildSpec;
    model: any;
    use: {
        [name: string]: any;
    };
    errs: any[];
    ctx: BuildContext;
    run: (rspec: RunSpec) => Promise<BuildResult>;
    log: Log;
}
interface BuildResult {
    ok: boolean;
    builder?: string;
    path?: string;
    build?: Build;
    builders?: BuildResult[];
    step?: string;
    errs?: any[];
}
interface BuildAction {
    path: string;
    build: Builder;
}
interface BuildContext {
    step: 'pre' | 'post';
    watch: boolean;
    state: Record<string, any>;
}
type Builder = (build: Build, ctx: BuildContext) => Promise<BuildResult>;
interface BuildSpec {
    path?: string;
    base?: string;
    res?: BuildAction[];
    require?: any;
    use?: {
        [name: string]: any;
    };
    log?: Log;
    idle?: number;
    name?: string;
    debug?: boolean | string;
    fs: any;
}
type Run = {
    canon: string;
    path: string;
    start: number;
    end: number;
    result?: BuildResult;
};
type RunSpec = {
    watch: boolean;
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
interface ModelSpec {
    path?: string;
    base?: string;
    require?: any;
    log?: Log;
    idle?: number;
    debug?: boolean | string;
    fs?: any;
}
export type { Build, BuildResult, BuildAction, Builder, BuildContext, BuildSpec, Log, Run, Canon, ChangeItem, RunSpec, ModelSpec, };
