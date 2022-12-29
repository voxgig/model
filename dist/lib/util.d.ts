type DiveMapper = (path: any[], leaf: any) => any[];
declare function dive(node: any, depth?: number | DiveMapper, mapper?: DiveMapper): any[];
declare function joins(arr: any[], ...seps: string[]): string;
export { dive, joins, };
