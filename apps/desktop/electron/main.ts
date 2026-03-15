import { app, BrowserWindow, protocol, net } from "electron";
import { join } from "node:path";
import { db, rawSqlite, mediaDir } from "./db";
import { getOrCreateLocalUser } from "./local-user";
import { loadWindowState, saveWindowState } from "./window-state";
import { registerIpcHandlers } from "./ipc-handlers";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

// Get or create local user
const localUser = getOrCreateLocalUser(db);

app.whenReady().then(() => {
  // Register media protocol
  protocol.handle("swanki-media", (request) => {
    const filename = decodeURIComponent(
      request.url.replace("swanki-media://media/", ""),
    );
    const filePath = join(mediaDir, filename);
    return net.fetch("file://" + filePath);
  });

  // Restore window state
  const windowState = loadWindowState();

  mainWindow = new BrowserWindow({
    ...windowState,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/preload.js`,
      ),
    },
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Register IPC handlers
  registerIpcHandlers(db, rawSqlite, localUser.id, mediaDir, mainWindow);

  // Save window state on close
  mainWindow.on("close", () => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds();
      saveWindowState({
        ...bounds,
        isMaximized: mainWindow.isMaximized(),
      });
    }
  });

  // Emit maximized changes to renderer
  mainWindow.on("maximize", () => {
    mainWindow?.webContents.send("window:maximized-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow?.webContents.send("window:maximized-changed", false);
  });

  // Load renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
