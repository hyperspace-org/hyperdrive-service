const p = require('path')
const fs = require('fs').promises
const { once } = require('events')

const test = require('tape')
const tmp = require('tmp-promise')
const { createOne } = require('./helpers/create')

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
