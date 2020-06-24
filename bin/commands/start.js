const { Command, flags } = require('@oclif/command')

const HyperdriveService = require('../..')
const HyperdriveServiceCommand = require('../../lib/cli')

class StartCommand extends Command {
  static usage = 'start'
  static description = 'Start the Hyperdrive service.'
  static flags = {
    'disable-fuse': flags.boolean({
      description: 'Disable FUSE mounting.',
      default: false
    }),
    host: flags.string({
      description: 'The Hyperspace service host.',
      required: false
    }),
    key: HyperdriveServiceCommand.keyFlag({
      description: 'The root drive key.',
      required: false
    }),
    mnt: flags.string({
      description: 'The root drive mountpoint.',
      required: false
    })
  }

  async run () {
    const { flags } = this.parse(StartCommand)
    const service = new HyperdriveService({
      ...flags
    })
    process.on('SIGINT', () => {
      service.close()
    })
    process.on('SIGTERM', () => {
      service.close()
    })
    return service.open()
  }
}

module.exports = StartCommand
