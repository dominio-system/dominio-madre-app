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

  // ─── Sentry bridge (v1.0.31) · captura errores de renderer vía main ──
  // Renderer no tiene Node, así que pasa errores por IPC al main process.
  sentryCapture: (err) => {
    try {
      const payload = err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { name: 'Error', message: String(err), stack: null };
      ipcRenderer.send('sentry:capture-exception', payload);
    } catch (_) { /* noop */ }
  },
  sentryMessage: (msg, level = 'info') => {
    try { ipcRenderer.send('sentry:capture-message', { message: msg, level }); }
    catch (_) { /* noop */ }
  },
  sentrySetUser: (user) => {
    try { ipcRenderer.send('sentry:set-user', user); }
    catch (_) { /* noop */ }
  },
  sentrySetTag: (key, value) => {
    try { ipcRenderer.send('sentry:set-tag', { key, value }); }
    catch (_) { /* noop */ }
  },
});
