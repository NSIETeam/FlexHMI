const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("simplehmiDesktop", {
  onClose: (callback) => ipcRenderer.on("save-before-close", () => callback()),
  closeReady: () => ipcRenderer.send("save-complete"),
});
