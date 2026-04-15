const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');

const VERCEL_URL = 'https://vaultcam.vercel.app/';

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#080810',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // allow cross-origin media
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  // ── Load from Vercel ──────────────────────────────────────────────────────
  win.loadURL(VERCEL_URL);

  // ── Grant ALL media permissions automatically ────────────────────────────
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = [
      'media', 'mediaKeySystem', 'geolocation',
      'notifications', 'fullscreen', 'pointerLock',
      'clipboard-read', 'clipboard-write',
    ];
    callback(allowed.includes(permission));
  });

  // Allow display capture (screen recording) - critical for getDisplayMedia
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    // Auto-approve display media requests from the renderer
    callback({ video: request.frame, audio: 'loopback' });
  }, { useSystemPicker: true }); // use system picker so user can choose what to share

  // Open external links in system browser
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

  // Reload shortcut
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.key === 'r') {
      win.webContents.reload();
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
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload() },
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
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => win?.webContents.toggleDevTools() },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Flags for WebRTC / media
app.commandLine.appendSwitch('enable-features', 'WebRTC-H265WithOpenH264FFmpeg,DesktopCaptureCroppedWindowRestore');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream', 'false');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('allow-http-screen-capture');
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');