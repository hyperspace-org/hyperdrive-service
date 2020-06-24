const p = require('path')
const fs = require('fs').promises
const { flags } = require('@oclif/command')

const HyperdriveServiceCommand = require('../../lib/cli')

class StatsCommand extends HyperdriveServiceCommand {
  static usage = 'stats [path]'
  static description = 'Get the networking stats for the drive mounted at a path.'
  static args = [
    {
      name: 'path',
      required: false,
      description: 'The path to the drive.'
    }
  ]
  static flags = {
    key: HyperdriveServiceCommand.keyFlag({
      required: false,
      description: 'A drive key (will override the path argument)'
    }),
    root: flags.boolean({
      required: false,
      description: 'Display stats for your private root drive',
      default: false
    }),
    storage: flags.boolean({
      required: false,
      description: 'Include storage stats.',
      default: false
    })
  }

  async run () {
    const { flags, args } = this.parse(StatsCommand)
    await super.run()
    if (args.path) args.path = this.parsePath(this.client.mnt, args.path)

    try {
      if (args.path) await this.infoForPath(args.path, flags.root)
      const stats = await this.client.stats(args.path, {
        key: flags.key,
        storage: flags.storage
      })
      console.log(JSON.stringify(stats, null, 2))
    } catch (err) {
      console.error('Could not get the drive stats:')
      console.error(`${err.details || err}`)
      this.exit(1)
    }
    this.exit(0)
  }
}

module.exports = StatsCommand
