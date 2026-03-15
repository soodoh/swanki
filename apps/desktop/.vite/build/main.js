"use strict";
const electron = require("electron");
const path = require("node:path");
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, `../renderer/${"main_window"}/preload.js`),
    },
  });
  {
    mainWindow.loadURL("http://localhost:5173");
  }
}
electron.app.on("ready", createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
