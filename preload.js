const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  notify: (message) => ipcRenderer.send('notify', message),
  getSettings: () => ipcRenderer.send('get-settings'),
  onSettings: (cb) => ipcRenderer.on('settings', (_, d) => cb(d)),
  updateSettings: (s) => ipcRenderer.send('update-settings', s),
  onSettingsSaved: (cb) => ipcRenderer.on('settings-saved', cb),
  navigateMain: () => ipcRenderer.send('navigate-main'),
  resetSettings: () => ipcRenderer.send('reset-settings')
});