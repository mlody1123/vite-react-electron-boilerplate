import type { InlineConfig, ViteDevServer } from 'vite'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import electronPath from 'electron'
import { build, createLogger, createServer } from 'vite'
import { spawn } from 'child_process'

// Shared config across multiple build watchers.
const sharedConfig: InlineConfig = {
  mode: 'development',
  build: { watch: {} },
}

/**
 * Create a Vite build watcher that automatically recompiles when a file is
 * edited.
 */
const getWatcher = (name: string, configFilePath: string, writeBundle: any) =>
  build({
    ...sharedConfig,
    configFile: configFilePath,
    plugins: [{ name, writeBundle }],
  })

/**
 * Setup a watcher for the preload package.
 */
const setupPreloadWatcher = async (viteServer: ViteDevServer) =>
  getWatcher('reload-app-on-preload-package-change', 'src/preload/vite.config.ts', () => {
    // Send a "full-reload" page event using Vite WebSocket server.
    viteServer.ws.send({ type: 'full-reload' })
  })

/**
 * Setup the `main` watcher.
 */
const setupMainWatcher = async () => {
  const logger = createLogger('info', { prefix: '[main]' })
  let spawnProcess: ChildProcessWithoutNullStreams | null = null

  return getWatcher('reload-app-on-main-package-change', 'src/main/vite.config.ts', () => {
    if (spawnProcess !== null) {
      spawnProcess.removeListener('exit', process.exit);
      spawnProcess.kill('SIGINT')
      spawnProcess = null
    }

    // Restart Electron process when main package is edited and recompiled.
    spawnProcess = spawn(String(electronPath), ['.'])

    // Stops the watch script when the application has been quit
    spawnProcess.addListener('exit', process.exit);
  })
}

(async () => {
  try {
    const rendererServer = await createServer({
      ...sharedConfig,
      configFile: 'src/renderer/vite.config.ts',
    })

    await rendererServer.listen(3000)
    rendererServer.printUrls()

    await setupPreloadWatcher(rendererServer)
    await setupMainWatcher()
  } catch (err) {
    console.error(err)
  }
})().catch((err) => console.error(err))
