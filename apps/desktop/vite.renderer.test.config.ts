import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.renderer.config";

/**
 * Renderer Vite config for e2e tests.
 *
 * Two changes from the base config:
 *
 * 1. `cacheDir: ".e2e-vite-cache"` — moves Vite's dep-optimisation cache out
 *    of node_modules/.vite/ into a test-owned directory that global-setup
 *    deletes on every run.  This guarantees a fresh optimisation pass each
 *    time, so the startup `full-reload` HMR event fires during global-setup
 *    (before Electron connects) rather than mid-test.
 *
 * 2. `server.hmr: false` — disables the HMR WebSocket entirely.  Without
 *    this, Electron establishes a WS connection to Vite on first window load.
 *    If the dep-optimisation `full-reload` message is queued at that instant
 *    (a narrow race between the filesystem rename and the WS broadcast), the
 *    page reloads mid-test and Playwright loses the CDP target.  With HMR
 *    disabled, no WS is established and `full-reload` is never delivered to
 *    Electron.  e2e tests do not need hot-reloading.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    cacheDir: ".e2e-vite-cache",
    server: {
      hmr: false,
    },
  }),
);
