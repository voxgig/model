
const Path = require('path')

const { writeFile } = require('fs/promises')


module.exports = async function css(model, build) {

  // TODO: build should provide project root
  // FIX: this is the build path of the config!!!
  let root = Path.resolve(build.path, '..', '..')

  await writeFile(Path.resolve(root,'foo.txt'), 'FOO')
}
