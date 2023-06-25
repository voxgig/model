"use strict";
/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.joins = exports.dive = void 0;
function dive(node, depth, mapper) {
    let d = (null == depth || 'number' != typeof depth) ? 2 : depth;
    mapper = 'function' === typeof depth ? depth : mapper;
    let items = [];
    Object.entries(node).reduce((items, entry) => {
        let key = entry[0];
        let child = entry[1];
        if (d <= 1) {
            items.push([[key], child]);
        }
        else {
            let children = dive(child, d - 1);
            children = children.map(child => {
                child[0].unshift(key);
                return child;
            });
            items.push(...children);
        }
        return items;
    }, items);
    if (mapper) {
        return items.reduce(((a, entry) => {
            entry = mapper(entry[0], entry[1]);
            a[entry[0]] = entry[1];
            return a;
        }), {});
    }
    return items;
}
exports.dive = dive;
/*
 * , => a,b
 * :, => a:1,b:2
 * :,/ => a:1,b:2/c:3,d:4/e:5,f:6
*/
function joins(arr, ...seps) {
    arr = arr || [];
    seps = seps || [];
    let sa = [];
    for (let i = 0; i < arr.length; i++) {
        sa.push(arr[i]);
        if (i < arr.length - 1) {
            for (let j = seps.length - 1; -1 < j; j--) {
                if (0 === (i + 1) % (1 << j)) {
                    sa.push(seps[j]);
                    break;
                }
            }
        }
    }
    return sa.join('');
}
exports.joins = joins;
//# sourceMappingURL=util.js.map