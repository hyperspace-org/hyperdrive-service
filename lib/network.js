const fuse = require('fuse-native')
const NetworkSet = require('./network-set.js')
const { HyperdriveFuse } = require('hyperdrive-fuse')
const { Stat } = require('hyperdrive-schemas')

const NETWORK_PATH = 'Network'

module.exports = class NetworkHandlers {
  constructor (createDrive, handlers, log) {
    this.handlers = handlers
    this._createDrive = createDrive
    this._fuseLogger = log
    this._cachedHandlers = new Map()
    this._networkDirs = new NetworkSet()
  }

  generateHandlers () {
    const rootInterceptorIndex = new Map()
    const networkInterceptorIndex = new Map()
    const started = Date.now()
    const log = this._fuseLogger

    // The RootListHandler/NetworkInfoHandler operate on the top-level Hyperdrive.
    // If any requests have paths in Network/, they will be intercepted by the additional handlers below.

    const RootListHandler = {
      id: 'root',
      test: '^\/$',
      search: /^\/$/,
      ops: ['readdir'],
      handler: (op, match, args, cb) => {
        return this.handlers.readdir.apply(null, [...args, (err, list) => {
          if (err) return cb(err)
          return cb(0, [...list, NETWORK_PATH])
        }])
      }
    }

    const NetworkInfoHandler = {
      id: 'networkinfo',
      test: '^/Network\/?$',
      search: /.*/,
      ops: ['getattr', 'readdir', 'getxattr'],
      handler: (op, match, args, cb) => {
        if (op === 'getxattr') return cb(0, null)
        if (op === 'getattr') return cb(0, Stat.directory({ uid: process.getuid(), gid: process.getgid(), mtime: started, ctime: started }))
        else if (op === 'readdir') return cb(0, this._networkDirs.list)
        else return handlers[op].apply(null, [...args, cb])
      }
    }

    // All subsequent handlers are bounded to operate within Network/, and the paths will be sliced accordingly
    // before being processed by the handlers.

    const NetworkHandler = {
      id: 'network',
      test: '^/Network/.+',
      search: /^\/Network\/(?<subpath>.*)/,
      ops: '*',
      handler: (op, match, args, cb) => {
        return dispatchNetworkCall(op, match, args, cb)
      }
    }

    const ByKeyHandler = {
      id: 'bykey',
      test: '^\/.+',
      ops: ['readdir', 'getattr', 'open', 'read', 'close', 'symlink', 'release', 'releasedir', 'opendir', 'getxattr'],
      search: /^(\/(?<key>\w+)(\+(?<version>\d+))?(\+(?<hash>\w+))?\/?)?/,
      handler: (op, match, args, cb) => {
        // If this is a stat on '/Network', return a directory stat.
        if (!match.groups.key) {
          if (op === 'readdir') return cb(0, [])
          if (op === 'releasedir') return cb(0)
          if (op === 'getattr') return cb(0, Stat.directory({ uid: process.getuid(), gid: process.getgid(), mtime: started, ctime: started }))
          return this.handlers[op].apply(null, [...args, cb])
        }
        let key = match.groups.key
        // Otherwise this is operating on a subdir of by-key, in which case perform the op on the specified drive.
        try {
          key = Buffer.from(key, 'hex')
          if (key.length !== 32) return cb(fuse.ENOENT)
        } catch (err) {
          return cb(-1)
        }

        var version = match.groups.version
        if (version && +version) version = +version

        if (op === 'getxattr') return cb(0, null)
        if (op === 'symlink') return cb(fuse.EPERM)

        if (version) this._networkDirs.add(key.toString('hex') + '+' + version)
        else this._networkDirs.add(key.toString('hex'))

        const handlersKey = key + '@' + version
        var handlers = this._cachedHandlers.get(handlersKey)

        if (!handlers) {
          this._createDrive({ ...this.opts, key, version, fuseNetwork: true }, (err, drive) => {
            if (err) return cb(fuse.EPERM)
            const fuse = new HyperdriveFuse(drive.drive, `/Network/${key}`, {
              force: true,
              log: this._fuseLogger.trace.bind(this._fuseLogger)
            })
            handlers = fuse.getBaseHandlers()
            const driveFuse = { fuse, handlers }
            this._cachedHandlers.set(handlersKey, driveFuse)
            return applyOp(handlers)
          })
        } else {
          return applyOp(handlers.handlers)
        }

        function applyOp (handlers) {
          args[0] = args[0].slice(match[0].length) || '/'
          handlers[op].apply(null, [...args, (err, result) => {
            if (err && op !== 'read' && op !== 'write') return cb(fuse.EPERM)
            return cb(err, result)
          }])
        }
      }
    }

    const networkDirInterceptors = [
      ByKeyHandler
    ]
    const rootInterceptors = [
      RootListHandler,
      NetworkInfoHandler,
      NetworkHandler
    ]
    for (const interceptor of rootInterceptors) {
      rootInterceptorIndex.set(interceptor.id, interceptor)
    }
    for (const interceptor of networkDirInterceptors) {
      networkInterceptorIndex.set(interceptor.id, interceptor)
    }

    const wrappedRootHandlers = {}
    const wrappedNetworkHandlers = {}

    for (const handlerName of Object.getOwnPropertyNames(this.handlers)) {
      const baseHandler = this.handlers[handlerName]
      if (typeof baseHandler !== 'function') {
        wrappedRootHandlers[handlerName] = baseHandler
      } else {
        wrappedRootHandlers[handlerName] = wrapHandler(rootInterceptors, rootInterceptorIndex, 0, handlerName, baseHandler)
        wrappedNetworkHandlers[handlerName] = wrapHandler(networkDirInterceptors, networkInterceptorIndex, NETWORK_PATH.length + 1, handlerName, baseHandler)
      }
    }

    return wrappedRootHandlers

    function wrapHandler (interceptors, index, depth, handlerName, handler) {
      log.debug({ handlerName }, 'wrapping handler')
      const activeInterceptors = interceptors.filter(({ ops }) => ops === '*' || (ops.indexOf(handlerName) !== -1))
      if (!activeInterceptors.length) return handler

      const matcher = new RegExp(activeInterceptors.map(({ test, id }) => `(?<${id}>${test})`).join('|'))

      return function () {
        const args = [...arguments].slice(0, -1)
        const matchPosition = handlerName === 'symlink' ? 1 : 0
        if (depth) {
          args[matchPosition] = args[matchPosition].slice(depth)
        }

        const matchArg = args[matchPosition]
        const match = matcher.exec(matchArg)
        if (!match) return handler(...arguments)

        if (log.isLevelEnabled('trace')) {
          log.trace({ id: match[1], path: args[0] }, 'syscall interception')
        }

        // TODO: Don't iterate here.
        for (const key in match.groups) {
          if (!match.groups[key]) continue
          var id = key
          break
        }

        const { handler: wrappedHandler, search } = index.get(id)
        return wrappedHandler(handlerName, search.exec(matchArg), args, arguments[arguments.length - 1])
      }
    }

    function dispatchNetworkCall (op, match, args, cb) {
      return wrappedNetworkHandlers[op](...args, cb)
    }
  }
}
