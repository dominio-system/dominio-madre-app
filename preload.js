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

  // ─── Fase 5 v1.0.7 · Vista Configuración ──────────────────────────
  // Metadata estática de la app (versión, plataforma, paths). Read-only.
  appInfo: () => ipcRenderer.invoke('app-info'),

  // Verifica si hay nueva versión publicada en GitHub Releases.
  // Devuelve { status, current, latest, releaseNotes, dmgUrl, ... }
  checkUpdates: () => ipcRenderer.invoke('check-updates'),

  // Abre las DevTools del dashboard (modo detach) — útil para debugging
  // sin necesidad de reabrir la app con --dev.
  openDevTools: () => ipcRenderer.send('open-devtools'),
});
