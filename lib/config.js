const p = require('path')
const os = require('os')
const fs = require('fs').promises

const CONFIG_ROOT = p.join(os.homedir(), '.hyperspace', 'config')
const CONFIG_FILE_PATH = p.join(CONFIG_ROOT, 'fuse.json')

function ensureConfigDirExists () {
  return fs.mkdir(CONFIG_ROOT, { recursive: true })
}

async function loadConfig () {
  await ensureConfigDirExists()
  try {
    const contents = await fs.readFile(CONFIG_FILE_PATH, { encoding: 'utf8' })
    return JSON.parse(contents)
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err
    return null
  }
}

async function saveConfig (config) {
  await ensureConfigDirExists()
  return fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2))
}

module.exports = {
  loadConfig,
  saveConfig
}
