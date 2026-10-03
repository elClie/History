const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#05040a",
    title: "HisTML",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep rAF + timers at full rate when the window is behind the projector screen
      backgroundThrottling: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "index.html"));
  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("toggle-fullscreen", () => {
  if (!win || win.isDestroyed()) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
