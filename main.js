const { app, BrowserWindow, session, Tray, Menu, ipcMain, Notification, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

autoUpdater.checkForUpdatesAndNotify();

const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store();

let tray = null;
let win;
const iconDir = path.join(__dirname, 'icons');
const getDefaultIcon = () => path.join(iconDir, process.platform === 'darwin' ? 'default.icns' : 'default.png');

let currentIcon = store.get('icon', getDefaultIcon());
let showTray = store.get('showTray', true);
let showNotifications = store.get('showNotifications', true);
let isFirstLaunch = !store.get('initialized');

function showToast(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

function createWindow() {
  const { width = 1000, height = 800 } = store.get('windowBounds', {});
  const lastView = store.get('lastView', 'messages');

  win = new BrowserWindow({
    width,
    height,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:messages'
    },
    icon: currentIcon
  });

  win.setMenuBarVisibility(false);

  if (isFirstLaunch || lastView === 'settings') {
    win.loadFile('settings.html');
    store.set('initialized', true);
  } else {
    win.loadURL('https://messages.google.com/web');
  }

  win.on('resize', () => {
    store.set('windowBounds', win.getBounds());
  });

  if (showTray) {
    tray = new Tray(currentIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Import Settings', click: async () => {
          const { canceled, filePaths } = await dialog.showOpenDialog({
            title: 'Import Settings',
            filters: [{ name: 'JSON', extensions: ['json'] }],
            properties: ['openFile']
          });
          if (!canceled && filePaths.length > 0) {
            try {
              const imported = JSON.parse(fs.readFileSync(filePaths[0]));
              Object.keys(imported).forEach(key => store.set(key, imported[key]));
              showToast('Settings Imported', 'Settings successfully restored. Restarting...');
              setTimeout(() => {
                app.relaunch();
                app.exit();
              }, 1000);
            } catch (err) {
              showToast('Import Failed', 'Invalid or corrupted file.');
            }
          }
        }
      },
      { label: 'Import Settings', click: () => {
          const importPath = path.join(app.getPath('desktop'), 'google-messages-settings-backup.json');
          if (fs.existsSync(importPath)) {
            const imported = JSON.parse(fs.readFileSync(importPath));
            Object.keys(imported).forEach(key => store.set(key, imported[key]));
            showToast('Settings Imported', 'Settings successfully restored. Restarting...');
            setTimeout(() => {
              app.relaunch();
              app.exit();
            }, 1000);
          } else {
            showToast('Import Failed', 'Backup file not found on Desktop.');
          }
        }
      },
      { label: 'Show App', click: () => win.show() },
      { label: 'Settings', click: () => {
          store.set('lastView', 'settings');
          win.loadFile('settings.html');
        }
      },
      { label: 'Messages', click: () => {
          store.set('lastView', 'messages');
          win.loadURL('https://messages.google.com/web');
        }
      },
      { label: 'Export Settings', click: () => {
          const timestamp = new Date().toISOString().split('T')[0];
          const backupDir = path.join(app.getPath('userData'), 'backups');
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
          const exportPath = path.join(backupDir, `settings-backup-${timestamp}.json`);

          const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort((a, b) => fs.statSync(path.join(backupDir, b)).mtime - fs.statSync(path.join(backupDir, a)).mtime);
          while (files.length >= 5) {
            const toDelete = files.pop();
            fs.unlinkSync(path.join(backupDir, toDelete));
          }
          fs.writeFileSync(exportPath, JSON.stringify(store.store, null, 2));
          showToast('Settings Exported', `Saved backup as ${path.basename(exportPath)} in backups folder.`);
        }
      },
      { label: 'Restart App', click: () => {
          app.relaunch();
          app.exit();
        }
      },
      { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Google Messages 4 Desktop');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => win.isVisible() ? win.hide() : win.show());
  }
}

ipcMain.on('get-settings', (event) => {
  const icons = fs.readdirSync(iconDir).filter(f => f.endsWith('.png') || f.endsWith('.icns'));
  event.reply('settings', {
    icon: path.basename(currentIcon),
    showTray,
    showNotifications,
    icons
  });
});

ipcMain.on('update-settings', (event, settings) => {
  if (settings.icon) {
    currentIcon = path.join(iconDir, settings.icon);
    store.set('icon', currentIcon);
    if (tray) tray.setImage(currentIcon);
  }
  if (settings.showTray !== undefined) store.set('showTray', showTray = settings.showTray);
  if (settings.showNotifications !== undefined) store.set('showNotifications', showNotifications = settings.showNotifications);
  event.reply('settings-saved');
  showToast('Settings Saved', 'Your preferences have been updated.');
});

ipcMain.on('reset-settings', (event) => {
  currentIcon = getDefaultIcon();
  showTray = true;
  showNotifications = true;
  store.set('icon', currentIcon);
  store.set('showTray', true);
  store.set('showNotifications', true);
  store.set('lastView', 'settings');
  if (tray) tray.setImage(currentIcon);
  event.reply('settings-saved');
  showToast('Settings Reset', 'All settings have been restored to default.');
});

ipcMain.on('notify', (_, msg) => {
  if (showNotifications) new Notification({ title: 'Google Messages', body: msg }).show();
});

ipcMain.on('navigate-main', () => {
  store.set('lastView', 'messages');
  win.loadURL('https://messages.google.com/web');
});

ipcMain.on('open-settings-page', () => {
  store.set('lastView', 'settings');
  win.loadFile('settings.html');
});

app.setLoginItemSettings({ openAtLogin: true });

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });