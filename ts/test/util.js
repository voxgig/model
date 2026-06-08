
const { dive } = require('..')

let out = dive({a:{b:{c:{$:{x:1}}}}},128)

console.log('OUT', out)
