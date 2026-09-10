const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

/** @type {BrowserWindow | null} */
let win = null;

function demoTarget() {
  // npm run demo:method2  →  electron . -- --demo=method2
  const arg = process.argv.find((a) => a.startsWith("--demo="));
  if (!arg) return null;
  return arg.slice("--demo=".length);
}

function createWindow() {
  const demo = demoTarget();
  const isDemo = demo === "method2";

  win = new BrowserWindow({
    width: isDemo ? 1100 : 1440,
    height: isDemo ? 900 : 900,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#05040a",
    title: isDemo
      ? "HisTML · Method 2 app demo"
      : "HisTML · Cách mạng tháng Tám 1945",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const file = isDemo
    ? path.join(__dirname, "..", "tools", "method2-app-demo.html")
    : path.join(__dirname, "..", "index.html");

  win.loadFile(file);

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

ipcMain.handle("capture-rect", async (_evt, rect) => {
  if (!win || win.isDestroyed()) return null;
  const { x, y, width, height } = rect || {};
  if (!(width > 1 && height > 1)) return null;

  const image = await win.capturePage({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });

  const size = image.getSize();
  const png = image.toPNG();
  return {
    width: size.width,
    height: size.height,
    png: Buffer.from(png).buffer.slice(
      png.byteOffset,
      png.byteOffset + png.byteLength
    ),
  };
});

ipcMain.handle("toggle-fullscreen", () => {
  if (!win || win.isDestroyed()) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
