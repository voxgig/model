import Pino from 'pino';
type Log = ReturnType<typeof Pino>;
interface Build {
    id: string;
    src: string;
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
    err: any[];
    ctx: BuildContext;
    run: () => Promise<BuildResult>;
    log: Log;
}
interface BuildResult {
    ok: boolean;
    builder?: string;
    path?: string;
    build?: Build;
    builders?: BuildResult[];
    step?: string;
    err?: any[];
}
interface BuildAction {
    path: string;
    build: Builder;
}
interface BuildContext {
    step: 'pre' | 'post';
    state: Record<string, any>;
}
type Builder = (build: Build, ctx: BuildContext) => Promise<BuildResult>;
interface BuildSpec {
    src: string;
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
}
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
export type { Build, BuildResult, BuildAction, Builder, BuildContext, BuildSpec, Log, Run, Canon, ChangeItem };
