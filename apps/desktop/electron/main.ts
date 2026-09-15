import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';

/**
 * Kagaz shop app — main process.
 *
 * Phase 0 only opens a window. The WebSocket client, the SQLite job queue,
 * printer discovery and the print executor arrive in Phases 4–6.
 */

/** In dev, Vite serves the renderer; in production it is bundled beside us. */
const DEV_SERVER_URL = process.env['KAGAZ_DEV_SERVER'];

/**
 * Double printing is the failure mode that costs a shop real paper (Risk 14),
 * so a second instance must never start. Enforce it before anything else.
 */
const gotTheLock = app.requestSingleInstanceLock();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Kagaz',
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Avoid the white flash while the renderer boots.
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Anything that wants a new window opens in the real browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Windows-only product: closing the window closes the shop.
    app.quit();
  });
}
