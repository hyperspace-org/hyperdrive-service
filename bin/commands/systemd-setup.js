const os = require('os')
const p = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const { Command } = require('@oclif/command')

module.exports = class SystemdCommand extends Command {
  static usage = 'systemd-setup'
  static description = 'Set up your systemd `.service` files for hyperspace and hyperdrive'

  async run () {
    const services = ['hyperspace', 'hyperdrive']
    try {
      if (os.platform() !== 'linux') throw new Error('Only supported on linux')
      const { status: noSystemd } = spawnSync('which', ['systemctl'])
      if (noSystemd) throw new Error('Systemd doesn\'t seem to be installed')
      const { status: noHyperspace } = spawnSync('which', ['hyperspace'])
      if (noHyperspace) throw new Error('Hyperspace is not installed')
      const { stdout: npmPrefix } = spawnSync('npm', ['config', 'get', 'prefix'])
      if (!npmPrefix) throw new Error('npm missing')
      const serviceDir = os.homedir() + '/.config/systemd/user'

      services.map(readServiceFile)
        .map(prefixServiceFileBinaryPath(npmPrefix.toString().trim()))
        .forEach(writeToServicesDirectory(serviceDir))

      console.log(`Successfully installed service files for hypercore and hyperdrive in ${serviceDir}`)
      console.log('To start hyperdrive and hyperspace server with systemctl just run:\n')
      console.log('systemctl --user start hyperdrive\n')
      console.log('… or start it now and have it persist between reboots with:\n')
      console.log('systemctl --user enable --now hyperdrive')
    } catch (err) {
      console.log('Failed setting up systemd service files:')
      console.error(err)
    }
    function readServiceFile (name) {
      return { name, file: fs.readFileSync(p.join(__dirname, `../../${name}.service`), { encoding: 'utf8' }) }
    }
    function prefixServiceFileBinaryPath (prefix) {
      return (service) => {
        const i = service.file.indexOf('ExecStart=') + 10
        return Object.assign(service, {
          file: [service.file.substring(0, i), prefix, '/bin/', service.file.substring(i, service.file.length)].join('')
        })

      }
    }
    function writeToServicesDirectory (dir) {
      spawnSync('mkdir', ['-p', dir])
      return (service) => fs.writeFileSync(dir + `/${service.name}.service`, service.file)
    }
  }
}
