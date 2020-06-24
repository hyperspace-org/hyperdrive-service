const cliProgress = require('cli-progress')
const { flags } = require('@oclif/command')

const HyperdriveServiceCommand = require('../../lib/cli')

class ImportCommand extends HyperdriveServiceCommand {
  static usage = 'import [dir] [key]'
  static description = 'Import a directory into a Hyperdrive.'
  static args = [
    {
      name: 'dir',
      description: 'The directory you would like to upload to the drive.',
      default: process.cwd(),
      required: true,
      parse: dir => {
        return p.resolve(dir)
      }
    },
    HyperdriveServiceCommand.keyArg({
      description: 'The drive key.',
      required: false
    })
  ]
  static flags = {
    'no-seed': flags.boolean({
      description: 'Do not seed the new drive on the Hyperdrive network',
      default: false
    }),
    'watch': flags.boolean({
      description: 'Stay running and continue importing new changes.',
      default: false
    })
  }

  async run () {
    const { args, flags } = this.parse(ImportCommand)
    if (flags['no-seed']) flags.noSeed = flags['no-seed']
    await super.run()

    var total = 0
    var uploaded = 0

    const { progress, drive, cleanup } = this.client.import(args.key, args.dir, flags)

    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)

    const bar = new cliProgress.SingleBar({
      format: `Importing | {bar} | {percentage}% | {value}/{total} Files`
    })
    console.log(`Importing ${args.dir} into ${drive.key.toString('hex')} (Ctrl+c to exit)...`)
    console.log()

    // TODO: This should be upstreamed into mirror-folder.
    progress.on('pending-not-ignored', name => {
      bar.setTotal(++total)
    })
    progress.on('put', () => {
      bar.update(++uploaded)
    })
    progress.on('del', () => {
      bar.update(++uploaded)
    })
    // TODO: This should be upstreamed into mirror-folder.
    progress.on('skip-not-ignored', (src, dst) => {
      bar.update(++uploaded)
    })
    progress.on('end', async () => {
      await cleanup()
      console.log('Upload completed or stopped by user. Exiting...')
      process.exit(0)
    })
    bar.start(1, 0)
  }
}

module.exports = ImportCommand
