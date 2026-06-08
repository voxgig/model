type InitResult = {
    created: string[];
    skipped: string[];
};
declare function initModel(dir: string, fs: any): InitResult;
export { initModel, };
export type { InitResult, };
