const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    readFile: (path) => ipcRenderer.invoke('file:read', path),
    saveFile: (path, buffer) => ipcRenderer.invoke('file:save', path, buffer),
});
