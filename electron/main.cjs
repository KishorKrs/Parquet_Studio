const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../build/icon.png')
  });

  const isDev = !app.isPackaged;
  // If in dev mode, load the Vite dev server URL
  // We'll pass the port via env if needed, or assume default 5173
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (isDev) {
    win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Parquet Files', extensions: ['parquet'] }],
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('file:read', async (event, filePath) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    // Returning buffer works in Electron, it gets serialized to Uint8Array/Buffer
    return buffer;
  } catch (e) {
    console.error("Error reading file:", e);
    throw e;
  }
});

ipcMain.handle('file:save', async (event, filePath, buffer) => {
  try {
    await fs.promises.writeFile(filePath, buffer);
    return true;
  } catch (e) {
    console.error("Error writing file:", e);
    throw e;
  }
});
