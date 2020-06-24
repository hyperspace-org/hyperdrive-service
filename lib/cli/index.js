const p = require('path').posix
const { Command, flags } = require('@oclif/command')

const HyperdriveServiceClient = require('../../client')

class HyperdriveServiceCommand extends Command {
  static keyFlag (info) {
    return flags.build({
      description: 'The drive key',
      required: false,
      parse: keyParser,
      ...info
    })()
  }

  static keyArg (info) {
    return {
      name: 'key',
      description: 'The drive key',
      required: false,
      parse: keyParser
    }
  }

  async infoForPath (path, showRootInfo) {
    const infoAndPath = await this.client.info(path)
    const rootInfoAndPath = await this.client.info(this.client.mnt)
    if (infoAndPath.key === rootInfoAndPath.key) {
      if (showRootInfo) return { ...rootInfoAndPath, root: true }
      const err = new Error()
      err.details = 'You requested info about your private root drive. To proceed, retry this command with --root (and be careful!).'
      err.root = true
      throw err
    }
    return { ...infoAndPath, root: false }
  }

  parsePath (mnt, path) {
    if (!path) throw new Error('Path must be specified.')
    path = p.resolve(path)
    if (path.startsWith(p.join(mnt, 'Network'))) throw new Error('Hyperdrive commands cannot be run on the Network directory.')
    if (path.startsWith(mnt)) return path
    throw new Error(`Path ${path} is not contained within the current mountpoint`)
  }

  constructor (argv, config) {
    super(argv, config)
    this.client = null
  }

  async run () {
    try {
      this.client = new HyperdriveServiceClient()
      await this.client.ready()
    } catch (err) {
      console.log('err:', err)
      console.error('Could not connect to the Hyperdrive service. Is it running? Check with `hyperdrive status`.')
      this.exit(1)
    }
  }
}

function keyParser (keyString) {
  const splitKeyString = keyString.split('://')
  if (splitKeyString.length > 1) keyString = splitKeyString[1]
  const key = Buffer.from(keyString, 'hex')
  if (key.length != 32) throw new Error('Key must be a 32-byte long hex string.')
  return key
}

module.exports = HyperdriveServiceCommand
