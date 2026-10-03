const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("HisApp", {
  isElectron: true,
  toggleFullscreen() {
    return ipcRenderer.invoke("toggle-fullscreen");
  },
});
