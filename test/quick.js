const Util = require('util')

let { Aontu, Lang, util } = require('aontu')

let A = Aontu
let D = (x) => console.dir(x, { depth: null })
let G = (v) =>
  console.log(v.canon, '::', Util.inspect(v.gen(), { depth: null }))

let lang = new Lang()
let P = lang.parse.bind(lang)


// G(A('number|1'))
// G(A('number|string'))
// G(A('number|*1'))
// G(A('string|*1'))
// G(A('a:*1,a:2'))


// G(A(`
// a: *true | boolean
// b: .a
// c: .a & false
// d: { x: .a }
// d: { x: false }
// e: { x: .a }
// f: { &: *true | boolean }
// f: { y: false }
// g: .f
// h: { &: .a }
// h: { z: false }
// `))


// G(A(`
// x: y: { m: n: *false | boolean }
// a: b: { &: .x.y }
// a: b: { c: {} }
// a: b: d: {}
// a: b: e: m: n: true
// `))


// G(A('@"'+__dirname+'/t03.jsonic"'))

G(A('@"'+__dirname+'/sys01/model/model.jsonic"'))




