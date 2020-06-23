const p = require('path')
const chalk = require('chalk')
const ora = require('ora')

const loadClient = require('../lib/loader')
const { normalize, keyCoercer } = require('../lib/cli')
const constants = require('../lib/constants')

exports.command = 'unseed [path]'
exports.desc = 'Stop seeding a Hyperdrive.'
exports.builder = {
  key: {
    description: 'The drive key to seed (will override the provided path)',
    type: 'string',
    default: null,
    coerce: keyCoercer
  }
}

exports.handler = function (argv) {
  var spinner = ora(chalk.blue('Leaving the network (this might take some time to unnanounce)'))
  loadClient((err, client) => {
    if (err) return onerror(err)
    return onclient(client)
  })

  async function onclient (client) {
    spinner.start()
    const config = {
      lookup: false,
      announce: false,
      remember: true
    }

    if (argv.key) {
      try {
        const drive = await client.drive.get({ key: argv.key })
        await drive.configureNetwork(config)
        await drive.close()
        return onsuccess(null, true)
      } catch (err) {
        return onerror(err)
      }
    }

    try {
      var mnt = normalize(argv.path)
    } catch (err) {
      return onerror(err)
    }
    if (!mnt.startsWith(constants.mountpoint)) return onerror(new Error(`You can only unseed drives mounted underneath the root drive at ${constants.mountpoint}`))
    client.fuse.configureNetwork(mnt, config, (err, rsp) => {
      if (err) return onerror(err)
      return onsuccess(mnt, false)
    })
  }

  function onerror (err) {
    spinner.fail(chalk.red('Could not unseed the drive:'))
    console.error(chalk.red(`${err.details || err}`))
    process.exit(1)
  }

  function onsuccess (mnt, isKey) {
    if (isKey) spinner.succeed(chalk.green(`Unseeded the drive with key at ${argv.key.toString('hex')}`))
    else spinner.succeed(chalk.green(`Unseeded the drive mounted at ${mnt}`))
    process.exit(0)
  }
}
