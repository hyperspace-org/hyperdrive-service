# @hyperspace/hyperdrive
A companion service for Hyperspace that provides FUSE/CLI access to Hyperdrives.

This service creates a "root drive" for you, which is a single, private Hyperdrive that's mounted at `~/Hyperdrive`. You can think of this root drive as a replacement for your normal home directory (where you might have Documents, Videos, and Pictures folders, for example).

The CLI gives you commands for interacting with Hyperdrives, both inside and outside of FUSE. Here are some of the included commands:
* The `mount` and `unmount` commands allow you to attach/detach other other Hyperdrives to/from your root drive.
* The `seed` and `unseed` commands let you decide whether you'd like to advertise a drive on the Hyperswarm DHT.
* The `import` and `export` commands are for users who don't want to use FUSE, but still want to move data in and out of Hyperdrives.

## For Hyperdrive Daemon Users
This module replaces the functionality of the [`hyperdrive-daemon`](https://github.com/hypercore-protocol/hyperdrive-daemon). If you've previously used that daemon, running Hyperspace for the first time will migrate your content in `~/.hyperdrive` to be compatible with this service.

Also, @hyperspace/hyperdrive will only run in the foreground -- we switched to this model to keep things easy to use and debug. If you'd like to run it persistently (such that this service and Hyperspace auto-start on reboot), you can set this up using your system's process manager (like systemd).

### Installation
Before installing the Hyperdrive service, you'll want to first install [`hyperspace`](https://github.com/hyperspace-org/hyperspace). Once Hyperspace is installed, run:
```
npm i @hyperspace/hyperdrive -g
```

After the NPM installation, you should have access to the `hyperdrive` CLI tool.

### Getting Started
In another terminal, spin up Hyperspace by running `hyperspace` (no other flags needed).

If you're planning on using FUSE, you have to perform a one-time setup step to do the FUSE installation. This will prompt you for `sudo` access:
```
$ hyperdrive fuse-setup
```

Once FUSE has been configured, you're ready to start the Hyperdrive service:
```
$ hyperdrive start
```

### API
`@hyperspace/hyperdrive` exposes an API for programmatically interacting with your root drive. To create a client:
```js
const HyperdriveServiceClient = require('@hyperspace/hyperdrive/client')
const client = new HyperdriveServiceClient()
```

#### `const client = new HyperdriveServiceClient(opts = {})`
Create a new client for interacting with the Hyperdrive service.

If you don't provide any options, options will be loaded from a configuration file inside of the `~/.hyperspace` directory and a Hyperspace client will be created automatically.

Options include:
```js
{
  mnt: string, // The FUSE mountpoint
  key: Buffer, // Your root drive key.
  client: HyperspaceClient // A hyperspace client.
}
```

#### `await client.mount(path, opts = {})`
Mounts a Hyperdrive inside of your root drive. `path` must be contained within your root drive's mountpoint (typically `~/Hyperdrive`).

Options include all options to Hyperdrive's mount method, such as:
```js
{
  key: Buffer, // The key of the drive you're mounting.
  version: number, // The drive version (if you're creating a static mount)
}
```

#### `await client.unmount(path)`
Unmount the drive mounted at `path`. `path` must be contained within your root drive's mountpoint (typically `~/Hyperdrive`).

#### `await client.seed(path, opts = {})`
Start announcing a mounted drive on the Hyperswarm DHT.

Options include:
```js
{
  remember: boolean, // true if this network configuration should be persisted across restarts.
}
```

#### `await client.unseed(path, opts = {})`
Stop announcing a mounted drive on the Hyperswarm DHT.

Options include:
```js
{
  remember: boolean, // true if this network configuration should be persisted across restarts.
}
```

#### `await client.info(path)`
Returns info about the drive mounted at `path`.

The info takes the form:
```
{
  key: Buffer, The drive's key
  discoveryKey: Buffer, // The drive's discovery key.
  writable: boolean, // true if the drive is writable.
  mountPath: string, // The path of the enclosing mountpoint.
  announce: boolean, // true if the drive is currently being announced on the DHT.
  lookup: boolean    // true if the drive is currently being looked up on the DHT.
}
```

#### `await client.stats(path)`
Return drive storage/networking statistics.

The stats take the form:
```js
{
   storage, // Storage info about each mountpoint in the drive.
   network, // Networking info about each mountpoint in the drive.
}
```

where `storage` has the same structure as that returned by [`Hyperdrive.stats`](https://github.com/hypercore-protocol/hyperdrive)
and `network` has the form:
```
{
  '/': {
    metadata: {
      key,
      discoveryKey,
      length: number, // The Hypercore's length,
      byteLength: number // The Hypercore's byteLength
      peers: [Peer] // An Array of Hypercore Peer objects.
    },
    content: {
      // Same as above
      ...
     }
  },
  '/mountpoint1': {
     // Same as above
     ...
  }
}
```

#### `const { progress, drive } = client.import(key, dir, opts = {})`
Imports a Hyperdrive into Hyperspace.

If you're using FUSE, you probably don't need to explictly `import`/`export`, because you can replicate this functionality using the filesystem alone.

`progress` is an instance of [`mirror-folder`](https://github.com/mafintosh/mirror-folder).
`drive` is the Hyperdrive that you're importing into.

Options include:
```js
{
  watch: false // Watch for changes.
}
```

_Note: This imported drive will not appear inside your root drive unless you explicitly mount it with `hyperdrive mount (mount path) (imported drive key)`_

#### `const { progress, drive } = client.export(key, dir, opts = {})`
Exports a Hyperdrive into a local directory.

If you're using FUSE, you probably don't need to explictly `import`/`export`, because you can replicate this functionality using the filesystem alone.

Options include:
```js
  watch: false // Watch for changes.
```

### CLI Commands
The `hyperdrive` CLI tool includes a handful of subcommands that wrap the API methods described above. Running `hyperdrive help` will give more complete usage info:
```
$ ./bin/run/run help
A Hyperspace service that for managing Hyperdrives over FUSE.

VERSION
  @hyperspace/hyperdrive/1.0.0 linux-x64 node-v12.9.1

USAGE
  $ hyperdrive [COMMAND]

COMMANDS
  autocomplete   display autocomplete installation instructions
  create         Create a new drive mounted at the specified path
  export         Export a Hyperdrive into a directory.
  force-unmount  Forcibly unmount the root filesystem (useful if it was not cleanly unmounted).
  fuse-setup     Perform a one-time configuration step for FUSE.
  help           display help for hyperdrive
  import         Import a directory into a Hyperdrive.
  info           Display information about the drive mounted at the given mountpoint.
  mount          Mount a drive at the specified mountpoint.
  seed           Seed a Hyperdrive on the network.
  start          Start the Hyperdrive service.
  stats          Get the networking stats for the drive mounted at a path.
  unmount        Unmount a drive. The root drive will be unmounted if a mountpoint is not specified.
  unseed         Stop seeding a Hyperdrive on the network.
```

### License
MIT
