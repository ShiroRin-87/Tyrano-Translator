const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tyranoBrowser", {
  getState: () => ipcRenderer.invoke("browser:get-state"),
  navigate: (url) => ipcRenderer.invoke("browser:navigate", String(url)),
  back: () => ipcRenderer.invoke("browser:back"),
  forward: () => ipcRenderer.invoke("browser:forward"),
  reload: () => ipcRenderer.invoke("browser:reload"),
  home: () => ipcRenderer.invoke("browser:home"),
  openSettings: () => ipcRenderer.invoke("browser:open-settings"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  clearCache: () => ipcRenderer.invoke("settings:clear-cache"),
  clearGlossaries: () => ipcRenderer.invoke("settings:clear-glossaries"),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on("browser:state", handler);
    return () => ipcRenderer.removeListener("browser:state", handler);
  }
});

