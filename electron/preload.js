const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("HisApp", {
  isElectron: true,
  captureRect(rect) {
    return ipcRenderer.invoke("capture-rect", rect);
  },
  toggleFullscreen() {
    return ipcRenderer.invoke("toggle-fullscreen");
  },
});
