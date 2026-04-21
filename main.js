const { app, BrowserWindow, ipcMain, shell, nativeTheme, Menu, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────
app.setName('Dominio Corporativo');
nativeTheme.themeSource = 'dark';

if (process.platform === 'darwin') {
  try {
    app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
  } catch (e) { console.warn('dock icon:', e.message); }
}

// Supabase config (para refresh y signOut desde main)
const SUPABASE_URL = 'https://ywlyuuddqitduqtdttgo.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3bHl1dWRkcWl0ZHVxdGR0dGdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDg2MzgsImV4cCI6MjA4OTYyNDYzOH0.vpjRNcQ_v2Vo9M2oQsCq95mSLOCctRf6cO4sWzpNCF8';

let loginWindow = null;
let dashboardWindow = null;
let currentSession = null;
let refreshTimer = null;

// ── Session persistence via safeStorage (Keychain macOS / DPAPI Windows) ─────
function getSessionPath() {
  return path.join(app.getPath('userData'), 'session.bin');
}

function persistSession(session) {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('safeStorage not available on this platform; session will not persist');
      return false;
    }
    const data = JSON.stringify(session);
    const encrypted = safeStorage.encryptString(data);
    fs.writeFileSync(getSessionPath(), encrypted, { mode: 0o600 });
    return true;
  } catch (e) {
    console.error('persistSession failed:', e.message);
    return false;
  }
}

function loadPersistedSession() {
  try {
    const p = getSessionPath();
    if (!fs.existsSync(p)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encrypted = fs.readFileSync(p);
    const decrypted = safeStorage.decryptString(encrypted);
    const session = JSON.parse(decrypted);

    // Validar que no esté muy vencido (si expiresAt < ahora - 7 dias, ignorar)
    // Los refresh tokens de Supabase típicamente duran 30-60 días
    const now = Math.floor(Date.now() / 1000);
    if (session.refreshTokenExpiresAt && session.refreshTokenExpiresAt < now) {
      console.log('Persisted session refresh token expired, discarding');
      clearPersistedSession();
      return null;
    }
    return session;
  } catch (e) {
    console.warn('loadPersistedSession failed:', e.message);
    return null;
  }
}

function clearPersistedSession() {
  try {
    const p = getSessionPath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.warn('clearPersistedSession failed:', e.message);
  }
}

// ── Refresh token con Supabase Auth API ─────────────────────────────────────
async function refreshAccessToken(refreshToken) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Refresh failed: ${resp.status} ${err}`);
  }
  return resp.json();
}

async function signOutSupabase(accessToken) {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
  } catch (e) {
    console.warn('signOutSupabase failed (ignoring):', e.message);
  }
}

// ── Refresh timer: auto-refresh ANTES de que expire ─────────────────────────
function scheduleRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (!currentSession || !currentSession.expiresAt) return;

  const now = Math.floor(Date.now() / 1000);
  const msUntilExpiry = (currentSession.expiresAt - now) * 1000;
  // Refresh 5 min antes de expiry (JWT Supabase dura 1h default)
  const msUntilRefresh = Math.max(msUntilExpiry - 5 * 60 * 1000, 10 * 1000);

  console.log(`Next token refresh in ${Math.round(msUntilRefresh / 1000)}s`);

  refreshTimer = setTimeout(async () => {
    try {
      const fresh = await refreshAccessToken(currentSession.refreshToken);
      currentSession = {
        ...currentSession,
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token || currentSession.refreshToken,
        expiresAt: fresh.expires_at || (Math.floor(Date.now() / 1000) + (fresh.expires_in || 3600)),
      };
      persistSession(currentSession);
      if (dashboardWindow) {
        dashboardWindow.webContents.send('session-refreshed', currentSession);
      }
      scheduleRefresh();
    } catch (e) {
      console.error('Auto-refresh failed, forcing logout:', e.message);
      doLogout();
    }
  }, msUntilRefresh);
}

// ── Menu ────────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Dominio Corporativo',
      submenu: [
        { label: 'Acerca de Dominio Corporativo', role: 'about' },
        { type: 'separator' },
        { label: 'Cerrar sesión', click: () => doLogout() },
        { type: 'separator' },
        { label: 'Ocultar', accelerator: 'Cmd+H', role: 'hide' },
        { label: 'Ocultar otros', accelerator: 'Cmd+Alt+H', role: 'hideOthers' },
        { label: 'Mostrar todo', role: 'unhide' },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'Cmd+Q', role: 'quit' }
      ]
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', accelerator: 'Cmd+R', role: 'reload' },
        { label: 'Forzar recarga', accelerator: 'Cmd+Shift+R', role: 'forceReload' },
        { label: 'DevTools', accelerator: 'Cmd+Alt+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Zoom +', role: 'zoomIn' },
        { label: 'Zoom −', role: 'zoomOut' },
        { label: 'Zoom real', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Ventana',
      submenu: [
        { label: 'Minimizar', accelerator: 'Cmd+M', role: 'minimize' },
        { label: 'Cerrar', accelerator: 'Cmd+W', role: 'close' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Ventanas ─────────────────────────────────────────────────────────────────
function createLoginWindow() {
  if (loginWindow) { loginWindow.focus(); return; }
  loginWindow = new BrowserWindow({
    width: 480,
    height: 620,
    resizable: false,
    center: true,
    title: 'Dominio Corporativo',
    backgroundColor: '#0c0c0c',
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  loginWindow.loadFile('login.html');
  if (process.argv.includes('--dev')) {
    loginWindow.webContents.openDevTools({ mode: 'detach' });
  }
  loginWindow.on('closed', () => { loginWindow = null; });
}

function createDashboardWindow() {
  if (dashboardWindow) { dashboardWindow.focus(); return; }
  dashboardWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    center: true,
    title: 'Dominio Corporativo',
    backgroundColor: '#0c0c0c',
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  dashboardWindow.loadFile('dashboard-madre.html');
  dashboardWindow.on('page-title-updated', (e) => e.preventDefault());
  if (process.argv.includes('--dev')) {
    dashboardWindow.webContents.openDevTools({ mode: 'detach' });
  }
  dashboardWindow.on('closed', () => { dashboardWindow = null; });
}

async function doLogout() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
  if (currentSession && currentSession.accessToken) {
    await signOutSupabase(currentSession.accessToken);
  }
  currentSession = null;
  clearPersistedSession();
  if (dashboardWindow) { dashboardWindow.destroy(); dashboardWindow = null; }
  if (!loginWindow) createLoginWindow();
}

// ── Auto-login al arrancar: si hay sesión persistida válida → abrir dashboard ──
async function tryAutoLogin() {
  const persisted = loadPersistedSession();
  if (!persisted) return false;

  // Si access token expirado → refresh
  const now = Math.floor(Date.now() / 1000);
  if (persisted.expiresAt && persisted.expiresAt <= now + 30) {
    try {
      const fresh = await refreshAccessToken(persisted.refreshToken);
      currentSession = {
        ...persisted,
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token || persisted.refreshToken,
        expiresAt: fresh.expires_at || (Math.floor(Date.now() / 1000) + (fresh.expires_in || 3600)),
      };
      persistSession(currentSession);
    } catch (e) {
      console.warn('Auto-login refresh failed:', e.message);
      clearPersistedSession();
      return false;
    }
  } else {
    currentSession = persisted;
  }

  createDashboardWindow();
  scheduleRefresh();
  return true;
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.on('login-success', (event, session) => {
  currentSession = session;
  persistSession(session);
  scheduleRefresh();
  createDashboardWindow();
  if (loginWindow) { loginWindow.destroy(); loginWindow = null; }
});

ipcMain.on('logout', () => doLogout());

ipcMain.handle('get-session', () => currentSession);

ipcMain.handle('refresh-session', async () => {
  if (!currentSession || !currentSession.refreshToken) {
    throw new Error('No session to refresh');
  }
  try {
    const fresh = await refreshAccessToken(currentSession.refreshToken);
    currentSession = {
      ...currentSession,
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token || currentSession.refreshToken,
      expiresAt: fresh.expires_at || (Math.floor(Date.now() / 1000) + (fresh.expires_in || 3600)),
    };
    persistSession(currentSession);
    scheduleRefresh();
    return currentSession;
  } catch (e) {
    doLogout();
    throw e;
  }
});

ipcMain.on('open-external', (event, url) => {
  if (url && url.startsWith('https://')) shell.openExternal(url);
});

// ── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  buildMenu();
  const autoLoggedIn = await tryAutoLogin();
  if (!autoLoggedIn) createLoginWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!loginWindow && !dashboardWindow) {
    if (currentSession) createDashboardWindow();
    else createLoginWindow();
  }
});

app.on('before-quit', () => {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
});
