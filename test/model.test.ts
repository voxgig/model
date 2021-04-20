import { expect, test } from '@jest/globals'

import { Model } from '..'

test('happy', () => {
  let s0 = 'a:1'
  let m0 = new Model({ src: s0 })
  let d0 = m0.get()
  expect(d0).toEqual({ a: 1 })
})
