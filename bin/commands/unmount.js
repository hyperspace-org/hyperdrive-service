const p = require('path').posix
const chalk = require('chalk')

const HyperdriveServiceCommand = require('../../lib/cli')

class UnmountCommand extends HyperdriveServiceCommand {
  static usage = 'unmount [path]'
  static description = 'Unmount a drive. The root drive will be unmounted if a mountpoint is not specified.'
  static args = [
    {
      name: 'path',
      required: true,
      description: 'The path to the drive to unmount (must be within the current root mountpoint).'
    }
  ]

  async run () {
    const { args } = this.parse(UnmountCommand)
    await super.run()
    if (args.path) args.path = this.parsePath(this.client.mnt, args.path)

    try {
      await this.client.unmount(args.path)
      console.log('Successfully unmounted the drive.')
    } catch (err) {
      console.error('Could not unmount the drive:')
      console.error(`${err.details || err}`)
      this.exit(1)
    }
    this.exit(0)
  }
}

module.exports = UnmountCommand
