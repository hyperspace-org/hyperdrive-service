const os = require('os')
const p = require('path')

const { NanoresourcePromise: Nanoresource } = require('nanoresource-promise/emitter')
const HyperspaceClient = require('hyperspace/client')
const hyperdrive = require('hyperdrive')
const maybe = require('call-me-maybe')
const pino = require('pino')

const { loadConfig, saveConfig } = require('./lib/config')
const NetworkHandlers = require('./lib/network')

const CONFIG_PREFIX = 'fuse'
const DEFAULT_MNT = p.join(os.homedir(), 'Hyperdrive')
const ROOT_DRIVE_CONFIG = 'fuse/root-drive'

module.exports = class HyperdriveService extends Nanoresource {
  constructor (opts = {}) {
    super()
    this.mnt = opts.mnt || DEFAULT_MNT
    this.key = opts.key
    this.log = opts.log || pino({
      name: 'hyperspace-fuse',
      level: opts.logLevel || 'info'
    }, pino.destination(2))

    this.remember = !!opts.remember
    this.disableFuse = !!opts.disableFuse

    this._client = opts.client || new HyperspaceClient(opts)
    this._rootDrive = null
  }

  async _open () {
    await this._client.ready()
    if (this.remember !== false) {
      const config = await loadConfig()
      if (config.key) this.key = Buffer.from(config.key, 'hex')
      if (config.mnt) this.mnt = config.mnt
    }
    if (this._fuseEnabled()) await this._mount()
  }

  async _close () {
    await this._unmount()
    await this._client.close()
  }

  _fuseEnabled () {
    if (this.disableFuse) return false
    var hyperfuse = null
    try {
      hyperfuse = require('hyperdrive-fuse')
    } catch (err) {
      notAvailable()
      return false
    }

    return new Promise(resolve => {
      hyperfuse.isConfigured((err, configured) => {
        if (err) {
          notAvailable()
          return resolve(false)
        }
        if (!configured) {
          notConfigured()
          return resolve(false)
        }
        return resolve(true)
      })
    })

    function notConfigured () {
      console.warn('FUSE is not configured. Run `hyperdrive fuse-setup`.')
    }
    function notAvailable () {
      console.warn('FUSE is not available on your platform.')
    }
  }

  async _runNetworkingHeuristics (drive) {
    // Always lookup readable drives.
    if (!drive.writable) {
      const networkConfig = await this._client.network.getConfiguration(drive.discoveryKey)
      if (!networkConfig) await this._client.network.configure(drive.discoveryKey, { announce: false, lookup: true, remember: false })
    }
    // Lookups must be done on new mounts immediately, then apply the parent's network config if an existing config does not exist.
    const mountListener = async (trie) => {
      this._client.network.configure(trie.feed.discoveryKey, {
        copyFrom: drive.discoveryKey,
        lookup: !trie.feed.writable,
        overwrite: false
      }).catch(err => {
        // If the configuration couldn't be overwritten, that's OK.
      })
    }
    const innerDrive = drive.drive
    innerDrive.on('mount', mountListener)
    innerDrive.once('close', () => innerDrive.removeListener('mount', mountListener))
  }

  async _createDrive (opts, cb) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }
    var drive = hyperdrive(this._client.corestore, opts && opts.key, {
      ...opts,
      extension: false
    }).promises
    return maybe(cb, (async () => {
      await drive.ready()
      await this._runNetworkingHeuristics(drive)
      return drive
    })())
  }

  async _mount () {
    await this._unmount()
    const { HyperdriveFuse } = require('hyperdrive-fuse')
    const drive = await this._createDrive({ key: this.key })
    const fuseLogger = this.log.child({ component: 'fuse' })
    const fuse = new HyperdriveFuse(drive.drive, this.mnt, {
      force: true,
      displayFolder: true,
      log: fuseLogger.trace.bind(this.log)
    })
    const handlers = fuse.getBaseHandlers()
    const networkHandlers = new NetworkHandlers(this._createDrive.bind(this), handlers, fuseLogger)
    await fuse.mount(networkHandlers.generateHandlers())
    this._rootDrive = drive
    this._rootFuse = fuse
    if (this.remember !== false) {
      const config = {
        rootDriveKey: this.key.toString('hex'),
        mnt: this.mnt
      }
      await saveConfig(this.config)
    }
  }

  async _unmount () {
    if (!this._rootFuse) return
    await this._rootFuse.unmount()
    this._rootDrive = null
    this._rootFuse = null
  }
}
