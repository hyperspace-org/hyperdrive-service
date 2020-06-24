const fs = require('fs').promises
const p = require('path')

const mirrorFolder = require('mirror-folder')

const { IMPORT_KEY_FILE_PATH, EXPORT_KEY_FILE_PATH } = require('./constants')

module.exports = async function importDirectory (client, key, dir, opts = {}) {
  if (!key) key = await loadKeyFromFile(dir)
  var closed = false

  const drive = await this.client._createDrive({ key })
  const discoveryKey = drive.discoveryKey
  if (!opts.noSeed) {
    await this._client.seed(null, { discoveryKey, lookup: true, announce: true, remember: true })
  }
  if (!drive.writable) {
    throw new Error('The target drive is not writable.')
  }
  await saveKeyToFile(dir, drive.key)

  const progress = mirrorFolder(dir, { fs: drive, name: '/' }, {
    watch: !!opts.watch,
    dereference: true,
    // When going from fs -> drive, it should overwrite.
    keepExisting: false,
    ignore: (file, stat, cb) => {
      if (shouldIgnore(file)) return process.nextTick(cb, null, true)
      return process.nextTick(cb, null, false)
    }
  })
  progress.on('skip', (src, dst) => {
    if (src && (shouldIgnore(src.name) || src.name === '/')) return
    if (dst && (shouldIgnore(dst.name) || dst.name === '/')) return
    progress.emit('skip-not-ignored', src, dst)
  })
  progress.on('pending' ({ name }) => {
    if (shouldIgnore(name)) return
    progress.emit('pending-not-ignored', name)
  })

  return { progress, drive, cleanup }

  async function cleanup () {
    if (closed) return
    closed = true
    localMirror.destroy()
    await drive.close()
  }
}

async function loadKeyFromFile (dir) {
  const keyPath = p.join(dir, IMPORT_KEY_FILE_PATH)
  try {
    const key = await fs.readFile(keyPath)
    return key
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err
    return null
  }
}

function saveKeyToFile (dir, key) {
  const keyPath = p.join(dir, IMPORT_KEY_FILE_PATH)
  return fs.writeFile(keyPath, key)
}

function shouldIgnore (name) {
  if (!name) return true
  if (name.indexOf(EXPORT_KEY_FILE_PATH) !== -1) return true
  else if (name.indexOf(IMPORT_KEY_FILE_PATH) !== -1) return true
  return false
}
