const p = require('path')
const ora = require('ora')
const { flags } = require('@oclif/command')

const HyperdriveServiceCommand = require('../../lib/cli')

class MountCommand extends HyperdriveServiceCommand {
  static usage = 'mount [path] [key]'
  static description = `Mount a drive at the specified mountpoint.`
  static args = [
    {
      name: 'path',
      required: true,
      description: 'The path where the drive will be mounted (must be within the current root mountpoint).'
    },
    HyperdriveServiceCommand.keyArg({
      description: 'The key of the drive that will be mounted (a new drive will be created if blank).'
    })
  ]
  static flags = {
    version: flags.integer({
      description: 'Mount a static checkout of the drive at a specific version.',
      required: false
    }),
    seed: flags.boolean({
      description: 'Seed the new drive on the Hyperdrive network (false by default for mounts)',
      required: false,
      default: false
    })
  }

  async run () {
    const { flags, args } = this.parse(MountCommand)
    await super.run()
    if (args.path) args.path = this.parsePath(this.client.mnt, args.path)
    const spinner = ora('Mounting your drive (if seeding, this might take a while to announce)...')
    try {
      const drive = await this.client.mount(args.path, {
        key: args.key ? args.key : null,
        version: flags.version,
      })
      const hsClient = this.client.hyperspaceClient

      if (flags.seed) {
        await hsClient.network.configure(drive.discoveryKey, { announce: true, lookup: true, remember: true}) 
      }
      await drive.close()

      const seeding = flags.seed

      spinner.succeed('Mounted a drive with the following info:')
      console.log()
      console.log(`  Path: ${args.path} `)
      console.log(`  Key:  ${drive.key.toString('hex')} `)
      if (flags.version) console.log(`  Version:    ${flags.version}`)
      console.log(`  Seeding: ${seeding}`)
      if (!seeding) {
        console.log()
        console.log(`This drive is private by default. To publish it, run \`hyperdrive seed ${args.path}\``)
      }
    } catch (err) {
      spinner.fail('Could not mount the drive:')
      console.error(`${err.details || err}`)
      this.exit(1)
    }
    this.exit(0)
  }
}

module.exports = MountCommand
