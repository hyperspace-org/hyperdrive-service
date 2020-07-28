const os = require('os')
const platform = os.platform()

if (platform === 'darwin' || platform === 'linux') {
  require('./all.js')
}
require('./no-fuse.js')
