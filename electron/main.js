const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#080810',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Allow camera/mic without extra prompts on desktop
      permissions: ['camera', 'microphone'],
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  // ── Load the web app ──────────────────────────────────────────────────────
  // In production, point to the built web folder served locally OR direct file
  win.loadFile(path.join(__dirname, 'web', 'index.html'));

  // Grant media permissions automatically on desktop
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'geolocation', 'notifications', 'fullscreen', 'pointerLock'];
    callback(allowed.includes(permission));
  });

  // Open external links in the system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // DevTools shortcut
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      win.webContents.toggleDevTools();
    }
  });

  Menu.setApplicationMenu(buildMenu());
}

function buildMenu() {
  const template = [
    {
      label: 'VaultCam',
      submenu: [
        { label: 'About VaultCam', role: 'about' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ];
  return require('electron').Menu.buildFromTemplate(template);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Allow media access flags on Linux/Windows
app.commandLine.appendSwitch('enable-features', 'WebRTC-H265WithOpenH264FFmpeg');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream', 'false');
