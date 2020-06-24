const os = require('os')
const { execSync } = require('child_process')
const { Command } = require('@oclif/command')

class ForceUnmountCommand extends Command {
  static usage = 'force-unmount'
  static description = 'Forcibly unmount the root filesystem (useful if it was not cleanly unmounted).'
  static args = [
    {
      name: 'mnt',
      required: true,
      description: 'The path to the FUSE mountpoint to forcibly unmount.'
    }
  ]

  async run () {
    const { args } = this.parse(ForceUnmountCommand)
    if (os.platform() === 'linux') {
      execSync(`sudo umount -l ${args.mnt}`)
    } else if (os.platform() === 'darwin') {
      execSync(`sudo diskutil unmount force ${args.mnt}`)
    }
  }
}

module.exports = ForceUnmountCommand
