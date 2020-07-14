const tmp = require('tmp-promise')
const { createMany: hsCreate } = require('hyperspace/test/helpers/create')

const HyperdriveService = require('../..')
const HyperdriveServiceClient = require('../../client')

async function create (numMounts, opts) {
  const { clients, cleanup: hsCleanup } = await hsCreate(numMounts, opts)
  const fuseMnts = []
  const fuseServices = []
  const fuseClients = []

  for (let i = 0; i < numMounts; i++) {
    const fuseMnt = await tmp.dir({ unsafeCleanup: true })
    const store = clients[i].corestore()
    const rootDriveCore = store.get()
    await rootDriveCore.ready()
    const fuseService = new HyperdriveService({
      key: rootDriveCore.key,
      mnt: fuseMnt.path,
      client: clients[i],
      remember: false
    })
    await fuseService.open()
    const fuseClient = new HyperdriveServiceClient({
      key: rootDriveCore.key,
      mnt: fuseMnt.path,
      client: clients[i]
    })
    await fuseClient.ready()
    fuseClients.push(fuseClient)
    fuseServices.push(fuseService)
    fuseMnts.push(fuseMnt)
  }

  return { fuseServices, fuseClients, fuseMnts, cleanup }

  async function cleanup () {
    await hsCleanup()
    for (const service of fuseServices) {
      await service.close()
    }
    for (const fuseMnt of fuseMnts) {
      await fuseMnt.cleanup()
    }
  }
}

async function createOne (opts) {
  const { fuseServices, fuseClients, fuseMnts, cleanup } = await create(1, opts)
  return {
    fuseService: fuseServices[0],
    fuseClient: fuseClients[0],
    fuseMnt: fuseMnts[0],
    cleanup
  }
}

module.exports = {
  create,
  createOne
}
