type DiveMapper = (path: any[], leaf: any) => any[];
declare function dive(node: any, depth?: number | DiveMapper, mapper?: DiveMapper): any[];
declare function joins(arr: any[], ...seps: string[]): string;
declare function get(root: any, path: string | string[]): any;
declare function pinify(path: string[]): string;
declare function camelify(input: any[] | string): string;
export { dive, joins, get, pinify, camelify, };
