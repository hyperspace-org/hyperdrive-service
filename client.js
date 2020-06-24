const p = require('path')
const codecs = require('codecs')
const isOptions = require('is-options')
const hyperdrive = require('hyperdrive')
const HyperspaceClient = require('hyperspace/client')

const { loadConfig } = require('./lib/config')
const HyperdriveService = require('.')
const importDirectory = require('./lib/cli/import')
const exportDrive = require('./lib/cli/export')

module.exports = class HyperdriveServiceClient {
  constructor (opts = {}) {
    this.key = opts.key
    this.mnt = opts.mnt

    this.hyperspaceClient = opts.client || new HyperspaceClient(opts)
    this._rootDrive = null
  }

  async ready () {
    if (this._rootDrive) return
    if (!this.key || !this.mnt) {
      const config = await loadConfig()
      if (config.rootDriveKey) this.key = Buffer.from(config.rootDriveKey, 'hex')
      if (config.mnt) this.mnt = config.mnt
    }
    if (!this.key) throw new Error('HyperdriveServiceClient was not given a root drive key.')
    if (!this.mnt) throw new Error('HyperdriveServiceClient was not given a root mountpoint.')
    this._rootDrive = await this._createDrive({ key: this.key })
  }

  _resolvePath (path) {
    const fullPath = p.resolve(path)
    if (!fullPath.startsWith(this.mnt)) throw new Error('Can only create a mount within the root drive.')
    return fullPath.slice(this.mnt.length)
  }


  async _createDrive (opts = {}) {
    var drive = hyperdrive(this.hyperspaceClient.corestore, opts && opts.key, {
      ...opts,
      extension: false
    }).promises
    await drive.ready()
    return drive
  }

  async mount (path, opts = {}) {
    await this.ready()
    const drive = await this._createDrive({ key: opts.key })
    await this._rootDrive.mount(this._resolvePath(path), drive.key, { ...opts, key: null })
    return drive
  }

  async unmount (path) {
    await this.ready()
    return this._rootDrive.unmount(this._resolvePath(path))
  }

  async info (path) {
    await this.ready()
    return new Promise((resolve, reject) => {
      const noopFilePath = '__does_not_exist'
      const noopPath = p.join(this._resolvePath(path), noopFilePath)
      this._rootDrive.drive.stat(noopPath, { trie: true }, (err, stat, trie, _, __, mountPath) => {
        if (err && err.errno !== 2) return reject(err)
        if (err && !trie) return resolve(null)
        this.hyperspaceClient.network.getConfiguration(trie.feed.discoveryKey, (err, networkConfig) => {
          if (err) return reject(err)
          return resolve({
            key: trie.key,
            discoveryKey: trie.feed.discoveryKey,
            writable: trie.feed.writable,
            mountPath: mountPath.slice(0, mountPath.length - noopFilePath.length),
            announce: !!(networkConfig && networkConfig.announce),
            lookup: !!(networkConfig && networkConfig.lookup)
          })
        })
      })
    })
  }

  async _driveFromPath (path, opts = {}) {
    var driveKey = null
    if (path) {
      const info = await this.info(path)
      if (!info) return null
      driveKey = info.key
    } else {
      driveKey = opts.key
    }
    return this._createDrive({ key: driveKey })
  }

  async stats (path, opts = {}) {
    if (isOptions(path)) {
      opts = path
      path = null
    }
    const drive = await this._driveFromPath(path, opts)

    const allMounts = await drive.getAllMounts({ memory: true })
    const network = {}
    for (const [mountpoint, { metadata, content }] of allMounts) {
      network[mountpoint] = {
        metadataPeers: metadata.peers.map(mapPeer),
        contentPeers: content.peers.map(mapPeer)
      }
    }

    const storageObj = {}
    if (opts.storage) {
      const stats = await drive.stats('/', opts)
      for (const [k, v] of stats) {
        storageObj[k] = v
      }
    }

    await drive.close()
    return {
      storage: storageObj,
      network
    }

    function mapPeer (p) {
      return {
        ...p,
        remotePublicKey: p.remotePublicKey.toString('hex'),
      }
    }
  }

  async seed (path, opts = {}) {
    if (isOptions(path)) {
      opts = path
      path = null
    }
    var discoveryKey = opts.discoveryKey
    if (discoveryKey && !Buffer.isBuffer(discoveryKey)) discoveryKey = Buffer.from(discoveryKey, 'hex')
    if (!discoveryKey) {
      const drive = await this._driveFromPath(path, opts)
      discoveryKey = drive.discoveryKey
      await drive.close()
    }
    return this.hyperspaceClient.network.configure(discoveryKey, { ...opts, announce: true, lookup: true })
  }

  async unseed (path, opts = {}) {
    if (isOptions(path)) {
      opts = path
      path = null
    }
    var discoveryKey = opts.discoveryKey
    if (discoveryKey && !Buffer.isBuffer(discoveryKey)) discoveryKey = Buffer.from(discoveryKey, 'hex')
    if (!discoveryKey) {
      const drive = await this._driveFromPath(path, opts)
      discoveryKey = drive.discoveryKey
      await drive.close()
    }
    return this.hyperspaceClient.network.configure(discoveryKey, { ...opts, announce: false, lookup: false })
  }

  async import (key, dir, opts) {
    return importDirectory(this, key, dir, opts)
  }

  async export (key, dir, opts) {
    return exportDrive(this, key, dir, opts)
  }
}
