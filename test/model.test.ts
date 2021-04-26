import { expect, test } from '@jest/globals'

import { Model } from '..'

test('happy', () => {
  let s0 = 'a:1'
  let m0 = new Model({ src: s0 })
  let d0 = m0.get()
  expect(d0).toEqual({ a: 1 })
})


test('basic', () => {

  let s0 = `
a0: { b: number }
a1: { b: 1 }
a2: { c: 2 }
a: /a0 & /a1 & /a2
`
  let m0 = new Model({ src: s0 }).get()
  // console.dir(m0, { depth: null })
  expect(m0.a).toEqual({ b: 1, c: 2 })


  let s1 = `
a: { b: number }
a: { b: 1 }
a: { c: 2 }
`
  let m1 = new Model({ src: s1 }).get()
  // console.dir(m1, { depth: null })
  expect(m1.a).toEqual({ b: 1, c: 2 })


})


test('file', () => {
  let s0 = 'z:1,a: @"' + __dirname + '/t02.jsonic"'
  //console.log(s0)

  let m0 = new Model({ src: s0 })
  //console.log(m0.get())

  expect(m0.get()).toEqual({ z: 1, a: { x: 1, b: { c: 1 } } })
})
