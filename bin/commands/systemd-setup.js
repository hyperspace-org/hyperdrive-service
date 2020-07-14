const os = require('os')
const p = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const { Command } = require('@oclif/command')

module.exports = class SystemdCommand extends Command {
  static usage = 'systemd-setup'
  static description = 'Set up your systemd `.service` files for hyperspace and hyperdrive'

  async run () {
    try {
      if (os.platform() !== 'linux') throw 'Only supported on linux'
      let { status: noSystemd } = spawnSync('which', ['systemctl'])
      if (noSystemd) throw 'Systemd doesn\'t seem to be installed'
      const hyperspaceService = fs.readFileSync(p.join(__dirname, '../../hyperspace.service'))
      const hyperdriveService = fs.readFileSync(p.join(__dirname, '../../hyperdrive.service'))
      const serviceDir = os.homedir() + '/.config/systemd/user'
      spawnSync('mkdir', ['-p', serviceDir])
      fs.writeFileSync(serviceDir + '/hyperspace.service', hyperspaceService)
      fs.writeFileSync(serviceDir + '/hyperdrive.service', hyperdriveService)
      console.log(`Successfully installed service files for hypercore and hyperdrive in ${serviceDir}`)
      console.log('To start hyperdrive and hyperspace server with systemctl just run:\n')
      console.log('systemctl --user start hyperdrive\n')
      console.log('… or start it now and have it persist between reboots with:\n')
      console.log('systemctl --user enable --now hyperdrive')
    } catch (err) {
      console.error(err)
    }
  }
}
