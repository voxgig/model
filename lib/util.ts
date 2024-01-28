/* Copyright © 2021-2023 Voxgig Ltd, MIT License. */


type DiveMapper = (path: any[], leaf: any) => any[]

function dive(node: any, depth?: number | DiveMapper, mapper?: DiveMapper): any[] {
  let d = (null == depth || 'number' != typeof depth) ? 2 : depth
  mapper = 'function' === typeof depth ? depth : mapper

  let items: any[] = []

  Object.entries(node || {}).reduce(
    (items: any[], entry: any[]) => {
      let key = entry[0]
      let child = entry[1]

      // console.log('CHILD', d, key, child)

      if ('$' === key) {
        // console.log('BBB', d)
        items.push([[], child])
      }
      else if (
        d <= 1 ||
        null == child ||
        'object' !== typeof child ||
        0 === Object.keys(child).length
      ) {
        // console.log('AAA', d)
        items.push([[key], child])
      }
      else {
        // console.log('CCC', d)
        let children = dive(child, d - 1)
        children = children.map(child => {
          child[0].unshift(key)
          return child
        })
        items.push(...children)
      }

      return items
    },
    items
  )

  // console.log('ITEMS', items)

  if (mapper) {
    return items.reduce(((a, entry) => {
      entry = (mapper as any)(entry[0], entry[1])
      if (null != entry[0]) {
        a[entry[0]] = entry[1]
      }
      return a
    }), {} as any)
  }

  return items
}


/*
 * , => a,b
 * :, => a:1,b:2
 * :,/ => a:1,b:2/c:3,d:4/e:5,f:6
*/
function joins(arr: any[], ...seps: string[]) {
  arr = arr || []
  seps = seps || []
  let sa = []
  for (let i = 0; i < arr.length; i++) {
    sa.push(arr[i])
    if (i < arr.length - 1) {
      for (let j = seps.length - 1; -1 < j; j--) {
        if (0 === (i + 1) % (1 << j)) {
          sa.push(seps[j])
          break
        }
      }
    }
  }
  return sa.join('')
}


function get(root: any, path: string | string[]): any {
  path = 'string' === typeof path ? path.split('.') : path
  let node = root
  for (let i = 0; i < path.length && null != node; i++) {
    node = node[path[i]]
  }
  return node
}


function pinify(path: string[]) {
  let pin = path
    .map((p: string, i: number) =>
      p + (i % 2 ? (i === path.length - 1 ? '' : ',') : ':'))
    .join('')
  return pin
}


function camelify(input: any[] | string) {
  let parts = 'string' == typeof input ? input.split('-') : input.map(n => '' + n)
  return parts
    .map((p: string) => ('' === p ? '' : (p[0].toUpperCase() + p.substring(1))))
    .join('')
}

export {
  dive,
  joins,
  get,
  pinify,
  camelify,
}
