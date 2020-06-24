const p = require('path').posix
const ora = require('ora')
const hypercoreCrypto = require('hypercore-crypto')
const { flags } = require('@oclif/command')

const HyperdriveServiceCommand = require('../../lib/cli')

class SeedCommand extends HyperdriveServiceCommand {
  static usage = 'seed [path]'
  static description = 'Seed a Hyperdrive on the network.'
  static args = [
    {
      name: 'path',
      required: false,
      default: process.cwd(),
      description: 'The path to the drive\'s location (must be within the root mountpoint).'
    }
  ]
  static flags = {
    key: HyperdriveServiceCommand.keyFlag({
      description: 'The drive key to seed (will override the provided path)'
    }),
    root: flags.boolean({
      description: 'Make your root drive (at ~/Hyperdrive) available to the network',
      default: false
    }),
    announce: flags.boolean({
      description: 'Announce that you\'re seeding the drive to the DHT',
      default: true
    }),
    lookup: flags.boolean({
      description: 'Lookup drive seeders on the DHT',
      default: true
    }),
    remember: flags.boolean({
      description: 'Save this drive\'s networking configuration across restarts',
      default: true
    })
  }

  async run () {
    const self = this
    const { flags, args } = this.parse(SeedCommand)
    await super.run()
    if (args.path) args.path = this.parsePath(this.client.mnt, args.path)

    const spinner = ora('Joining the network (might take a while to announce)...')
    spinner.start()

    const config = {
      lookup: flags.lookup,
      announce: flags.announce,
      remember: flags.remember
    }

    const discoveryKey = flags.key ? hypercoreCrypto.discoveryKey(flags.key) : null
    try {
      if (args.path) await this.infoForPath(args.path, flags.root)
      await this.client.seed(args.path, {
        discoveryKey,
        ...config
      })
      onsuccess(args.path, !!discoveryKey)
      process.exit(0)
    } catch (err) {
      onerror(err)
      process.exit(1)
    }

    function onerror (err) {
      spinner.fail('Could not seed the drive:')
      console.error(`${err.details || err}`)
      self.exit(1)
    }

    function onsuccess (mnt, isKey) {
      if (isKey) spinner.succeed(`Seeding the drive with key ${flags.key.toString('hex')}`)
      else spinner.succeed(`Seeding the drive mounted at ${args.path}`)
    }
  }
}

module.exports = SeedCommand
