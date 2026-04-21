const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,

  // Navegación externa
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Auth: login window → main → dashboard window
  loginSuccess: (sessionData) => ipcRenderer.send('login-success', sessionData),
  logout: () => ipcRenderer.send('logout'),

  // Dashboard: leer sesión pasada desde main
  getSession: () => ipcRenderer.invoke('get-session'),

  // Dashboard: solicitar refresh manual del access token (raro, usualmente auto)
  refreshSession: () => ipcRenderer.invoke('refresh-session'),

  // Dashboard: escuchar cuando main refresca la sesión automático
  onSessionRefreshed: (callback) => {
    ipcRenderer.on('session-refreshed', (_, session) => callback(session));
  },
});
