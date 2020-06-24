const p = require('path')
const ora = require('ora')
const { flags } = require('@oclif/command')

const HyperdriveServiceCommand = require('../../lib/cli')

class CreateCommand extends HyperdriveServiceCommand {
  static usage = 'create [path]'
  static description = 'Create a new drive mounted at the specified path'
  static args = [
    {
      name: 'path',
      required: false,
      description: 'The path to the location inside the root mountpoint where your new drive will be created'
    }
  ]
  static flags = {
    'no-seed': flags.boolean({
      description: 'Do not seed the new drive on the Hyperdrive network',
      default: false
    })
  }

  async run () {
    const { flags, args } = this.parse(CreateCommand)
    await super.run()
    const spinner = ora('Creating your new drive (if seeding, this might take a while to announce)...')
    try {
      if (args.path) args.path = this.parsePath(this.client.mnt, args.path)
      const drive = await this.client.mount(args.path)
      const hsClient = this.client.hyperspaceClient

      if (!flags['no-seed']) {
        await hsClient.network.configure(drive.discoveryKey, { announce: true, lookup: true, remember: true}) 
      }
      const network = await hsClient.network.getConfiguration(drive.discoveryKey)
      console.log('closing drive')
      await drive.close()
      console.log('drive closed')

      const seeding = !!network.announce
      spinner.succeed('Created a drive with the following info:')
      console.log()
      console.log(`  Path: ${args.path} `)
      console.log(`  Key:  ${drive.key.toString('hex')} `)
      console.log(`  Seeding: ${seeding}`)
      if (!seeding) {
        console.log()
        console.log(`This drive not being announced by default. To announce it on the DHT, run \`hyperdrive seed ${args.path}\``)
      }
    } catch (err) {
      spinner.fail('Could not create the drive:')
      console.error(`${err.details || err}`)
      process.exit(1)
    }
    process.exit(0)
  }
}

module.exports = CreateCommand
