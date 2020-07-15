const p = require('path')
const fs = require('fs').promises
const { once } = require('events')

const test = require('tape')
const tmp = require('tmp-promise')
const hypercoreCrypto = require('hypercore-crypto')
const { create, createOne } = require('./helpers/create')

test('can start/stop the fuse service', async t => {
  const { fuseService, fuseMnt, cleanup } = await createOne()
  {
    const contents = await fs.readdir(fuseMnt.path)
    t.same(contents, ['Network'])
  }
  await fuseService.close()
  {
    const contents = await fs.readdir(fuseMnt.path)
    t.same(contents, [])
  }
  await cleanup()
  t.end()
})

test('can mount a drive', async t => {
  const { fuseClient, fuseMnt, cleanup } = await createOne()

  const drive = await fuseClient.mount(p.join(fuseMnt.path, 'test-drive'))
  {
    const contents = await fs.readdir(fuseMnt.path)
    t.same(contents, ['Network', 'test-drive'])
  }

  await drive.writeFile('hello', 'world')

  {
    const contents = await fs.readFile(p.join(fuseMnt.path, 'test-drive', 'hello'))
    t.same(contents, Buffer.from('world', 'utf8'))
  }

  await cleanup()
  t.end()
})

test('can mount a drive twice', async t => {
  const { fuseClient, fuseMnt, cleanup } = await createOne()

  const drive = await fuseClient.mount(p.join(fuseMnt.path, 'test-drive'))
  await fuseClient.mount(p.join(fuseMnt.path, 'test-drive-2'), { key: drive.key })
  {
    const contents = await fs.readdir(fuseMnt.path)
    t.same(contents, ['Network', 'test-drive', 'test-drive-2'])
  }

  await drive.writeFile('hello', 'world')

  {
    const contents = await fs.readFile(p.join(fuseMnt.path, 'test-drive-2', 'hello'))
    t.same(contents, Buffer.from('world', 'utf8'))
  }

  await cleanup()
  t.end()
})

test('can unmount a drive', async t => {
  const { fuseClient, fuseMnt, cleanup } = await createOne()

  await fuseClient.mount(p.join(fuseMnt.path, 'test-drive'))
  {
    const contents = await fs.readdir(fuseMnt.path)
    t.same(contents, ['Network', 'test-drive'])
  }

  await fuseClient.unmount(p.join(fuseMnt.path, 'test-drive'))

  {
    const contents = await fs.readdir(fuseMnt.path)
    t.same(contents, ['Network'])
  }

  await cleanup()
  t.end()
})

test('can get mounted drive info', async t => {
  const { fuseClient, fuseMnt, cleanup } = await createOne()

  const drive = await fuseClient.mount(p.join(fuseMnt.path, 'test-drive'))
  const badKey = hypercoreCrypto.randomBytes(32)
  await fuseClient.mount(p.join(fuseMnt.path, 'nonwritable'), {
    key: badKey
  })
  await drive.mkdir('hello')
  await drive.mkdir('world')
  await drive.writeFile('hello/world/blah.txt', 'blah')

  {
    const info = await fuseClient.info(fuseMnt.path)
    t.true(info.writable)
    t.true(info.key.equals(fuseClient._rootDrive.key))
    t.false(info.mountPath)
  }

  {
    const info = await fuseClient.info(p.join(fuseMnt.path, 'test-drive'))
    t.true(info.writable)
    t.true(info.key.equals(drive.key))
    t.false(info.mountPath)
  }

  {
    const info = await fuseClient.info(p.join(fuseMnt.path, 'test-drive', 'hello', 'world'))
    t.true(info.writable)
    t.true(info.key.equals(drive.key))
    t.same(info.mountPath, 'hello/world/')
  }

  {
    const info = await fuseClient.info(p.join(fuseMnt.path, 'nonwritable'))
    t.false(info.writable)
    t.true(info.key.equals(badKey))
    t.false(info.mountPath)
  }

  await cleanup()
  t.end()
})

test('can read from Network/by-key', async t => {
  const { fuseClient, fuseMnt, cleanup } = await createOne()

  const drive = await fuseClient.mount(p.join(fuseMnt.path, 'test-drive'))
  await drive.writeFile('hello', 'world')

  {
    const contents = await fs.readFile(p.join(fuseMnt.path, 'Network', drive.key.toString('hex'), 'hello'))
    t.same(contents, Buffer.from('world', 'utf8'))
  }

  await cleanup()
  t.end()
})

test('can seed a mounted drive', async t => {
  const { fuseClients, fuseMnts, cleanup } = await create(3)

  var sharedDriveKey = null
  var unsharedDriveKey = null

  // Create the first drive -- this one will be announced.
  {
    const client = fuseClients[0]
    const mnt = fuseMnts[0]
    const sharedDrivePath = p.join(mnt.path, 'shared-drive')

    const sharedDrive = await client.mount(sharedDrivePath)
    sharedDriveKey = sharedDrive.key

    await sharedDrive.writeFile('hello', 'world')

    await client.seed(sharedDrivePath)
  }

  // Create the second drive -- this one will not be announced.
  {
    const client = fuseClients[1]
    const mnt = fuseMnts[1]
    const unsharedDrivePath = p.join(mnt.path, 'unshared-drive')

    const unsharedDrive = await client.mount(unsharedDrivePath)
    unsharedDriveKey = unsharedDrive.key

    await unsharedDrive.writeFile('shouldnot', 'see')
  }

  // Mount both drives in a third daemon -- only the first should be discovered.
  {
    const client = fuseClients[2]
    const mnt = fuseMnts[2]
    const sharedDrivePath = p.join(mnt.path, 'shared-drive')
    const unsharedDrivePath = p.join(mnt.path, 'unshared-drive')

    await client.mount(sharedDrivePath, { key: sharedDriveKey })
    await client.mount(unsharedDrivePath, { key: unsharedDriveKey })

    // Both drives are read-only, so hyperdrive will automatically do a swarm lookup.
    const sharedContents = await fs.readdir(sharedDrivePath)
    const unsharedContents = await fs.readdir(unsharedDrivePath)

    t.same(sharedContents, ['hello'])
    t.same(unsharedContents, [])
  }

  await cleanup()
  t.end()
})

test('simple import', async t => {
  const { fuseClient, cleanup } = await createOne()

  // create a tmp dir
  const importDir = await tmp.dir({ unsafeCleanup: true })
  await fs.writeFile(p.join(importDir.path, 'test.txt'), 'hello world')

  try {
    // now import the dir
    const { progress: importProgress, drive, cleanup: importCleanup } = await fuseClient.import(null, importDir.path)

    const [, dst] = await once(importProgress, 'put-end')
    t.same(dst.name, '/test.txt')
    const contents = await drive.readFile('test.txt', { encoding: 'utf8' })
    t.same(contents, 'hello world')

    await drive.close()

    await importCleanup()
    await importDir.cleanup()
  } catch (err) {
    t.fail(err)
  }

  await cleanup()
  t.end()
})

test('simple export', async t => {
  const { fuseClient, cleanup } = await createOne()

  // create a tmp dir
  const exportDir = await tmp.dir({ unsafeCleanup: true })

  // create a test drive
  const drive = await fuseClient._createDrive()
  await drive.writeFile('export.txt', 'hello world')

  const { progress, cleanup: exportCleanup } = await fuseClient.export(drive.key, exportDir.path)
  await new Promise(resolve => {
    progress.on('end', async () => {
      const contents = await fs.readFile(p.join(exportDir.path, 'export.txt'), { encoding: 'utf8' })
      t.same(contents, 'hello world')
      await drive.close()
      await exportCleanup()
      await exportDir.cleanup()
      return resolve()
    })
  })

  await cleanup()
  t.end()
})
