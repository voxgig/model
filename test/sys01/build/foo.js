
const Path = require('path')

module.exports = async function css(model, build) {

  // TODO: build should provide project root
  // FIX: this is the build path of the config!!!
  let root = Path.resolve(build.path, '..', '..')

  await build.fs.writeFile(Path.resolve(root,'foo.txt'), 'FOO', ()=>{})
}
