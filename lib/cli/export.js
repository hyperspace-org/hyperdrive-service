const fs = require('fs').promises
const p = require('path')
const { EventEmitter } = require('events')

const mirrorFolder = require('mirror-folder')
const low = require('last-one-wins')
const streamx = require('streamx')
const pump = require('pump')

const { EXPORT_KEY_FILE_PATH } = require('./constants')

class DriveWatcher extends EventEmitter {
  constructor (client, drive, opts = {}) {
    super()
    this.client = client
    this.drive = drive
    this.recursive = !!opts.recursive
    this.drivesByPath = new Map([[ '/', drive ]])
    this.versionsByPath = new Map()
    this.unwatchesByPath = new Map()
    this.watchers = []
    this.timer = null
    this.emittingStats = false
  }

  _createDiffer (path, drive) {
    // Last-one-wins in case the watch is triggered many times in quick succession.
    const self = this
    return low(onupdate)

    async function onupdate (_, cb) {
      const lastVersion = self.versionsByPath.get(path)
      try {
        const diffStream = await drive.createDiffStream(lastVersion)
        const currentVersion = await drive.version()
        self.versionsByPath.set(path, currentVersion)
        return pump(diffStream, new streamx.Transform({
          transform: (data, cb) => {
            for (const watcher of self.watchers) {
              watcher(p.join(path, data.name))
            }
            return cb(null)
          }
        }), err => {
          if (err) return cb(err)
          return cb(null)
        })
      } catch (err) {
        return cb(err)
      }
    }
  }

  async _emitStats () {
    if (this.emittingStats) return
    this.emittingStats = true
    var total = 0
    var downloaded = 0
    var peers = 0
    for (const [path, drive] of this.drivesByPath) {
      const driveStats = await drive.stats()
      for (const { path, content } of driveStats.stats) {
        if (path !== '/' || !content) continue
        downloaded += content.downloadedBlocks
        total += content.totalBlocks
        peers = content.peers
      }
    }
    this.emit('stats', { total, downloaded, peers })
    this.emittingStats = false
  }

  async start () {
    // TODO: Handle dynamic (un)mounting.
    this.versionsByPath.set('/', await this.drive.version())
    this.unwatchesByPath.set('/', this.drive.watch('/', this._createDiffer('/', this.drive)))
    const allMounts = await this.drive.mounts({ memory: false, recursive: this.recursive })
    for (const { path, opts } of allMounts) {
      if (path === '/') continue
      const childDrive = await this.client.drive.get({ key: opts.key })
      this.drivesByPath.set(path, childDrive)
      this.versionsByPath.set(path, opts.version)
      this.unwatchesByPath.set(path, childDrive.watch('/', this._createDiffer(path, childDrive)))
    }
    this.timer = setInterval(this._emitStats.bind(this), 1000)
  }

  watch (_, onwatch) {
    // The watch path is ignored for drives.
    this.watchers.push(onwatch)
    return () =>  {
      this.watchers.splice(this.watchers.indexOf(onwatch), 1)
    }
  }

  async close () {
    for (const [path, unwatch] of this.unwatchesByPath) {
      await unwatch()
    }
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}

module.exports = async function exportDrive (client, key, dir, opts = {}) {
  var loadedKey = false
  var closed = false

  if (!dir) {
    // If the directory was not specified, we're in one of two cases:
    // 1) We're in a directory that we previously downloaded into, in which case reuse that key.
    // 2) This is a new download, in which case create a new target dir.
    dir = process.cwd()
    const savedKey = await loadKeyFromFile(dir)
    if (savedKey) {
      loadedKey = true
      key = key || savedKey
    } else {
      if (!key) throw new Error('If you are not resuming a previous download, a key must be specified.')
      dir = p.join(dir, key.toString('hex'))
    }
  }

  const drive = await this.client._createDrive({ key })
  if (!loadedKey) await saveKeyToFile(dir, drive.key)

  const driveWatcher = new DriveWatcher(this.client, drive, {
    recursive: opts.recursive
  })
  await driveWatcher.start()

  const progress = mirrorFolder({ fs: drive, name: '/' }, dir, {
    watch: opts.watch ? driveWatcher.watch.bind(driveWatcher) : false,
    keepExisting: true,
    ensureParents: true
  })
  driveWatcher.on('stats', stats => {
    progress.emit('stats', stats)
  })

  return { progress, drive, cleanup, dir }

  async function cleanup () {
    if (closed) return
    closed = true
    await driveWatcher.close()
    await drive.close()
  }
}

async function loadKeyFromFile (dir) {
  const keyPath = p.join(dir, EXPORT_KEY_FILE_PATH)
  try {
    const key = await fs.readFile(keyPath)
    return key
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err
    return null
  }
}

async function saveKeyToFile (dir, key) {
  const keyPath = p.join(dir, EXPORT_KEY_FILE_PATH)
  await fs.mkdir(dir, { recursive: true })
  return fs.writeFile(keyPath, key)
}
