
const Path = require('node:path')
const Fs = require('node:fs')

module.exports = async function css(model, build) {

  let root = Path.resolve(build.path, '..', '..')
  let args = build.args?.pre
  let bar = args?.bar
  
  if(!build.dryrun) {
    Fs.writeFileSync(Path.resolve(root,'pre.txt'), 'PRE:'+bar)
    Fs.writeFileSync(Path.resolve(root,'model','pre.jsonic'), 'OK')
  }

  return { ok: true, reload: true }
}


module.exports.step = 'pre'
