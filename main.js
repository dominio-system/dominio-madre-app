const { app, BrowserWindow, ipcMain, shell, nativeTheme, Menu, safeStorage } = require('electron');
const Sentry = require('@sentry/electron/main');
const path = require('path');
const fs = require('fs');

// ── Sentry (error tracking) ─────────────────────────────────────────────────
// El DSN es semi-público (queda en el binario); NO es secret.
// Compartimos proyecto con cliente · diferenciamos por `release` tag.
const SENTRY_DSN = 'https://fe808b6a8002aed80b9893cd68ed72c5@o4511273677422592.ingest.us.sentry.io/4511273688170496';

const _PII_KEY_RE = /(token|jwt|password|apikey|api[_-]?key|secret|authorization|session|refresh|credentials|bearer)/i;

function _scrubObject(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;
  if (Array.isArray(obj)) return obj.map(v => _scrubObject(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (_PII_KEY_RE.test(k)) { out[k] = '[REDACTED]'; continue; }
    if (v && typeof v === 'object') { out[k] = _scrubObject(v, depth + 1); continue; }
    if (typeof v === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(v) && v.length > 40) {
      out[k] = '[JWT-REDACTED]'; continue;
    }
    out[k] = v;
  }
  return out;
}

Sentry.init({
  dsn: SENTRY_DSN,
  release: `dominio-madre@${app.getVersion()}`,
  environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  tracesSampleRate: 0,
  profilesSampleRate: 0,
  beforeSend(event) {
    try {
      if (event.request?.headers) event.request.headers = _scrubObject(event.request.headers);
      if (event.request?.data)    event.request.data    = _scrubObject(event.request.data);
      if (event.extra)            event.extra           = _scrubObject(event.extra);
      if (event.contexts)         event.contexts        = _scrubObject(event.contexts);
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(b => {
          if (b.data)    b.data    = _scrubObject(b.data);
          if (b.message) b.message = String(b.message).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT-REDACTED]');
          return b;
        });
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
    } catch (e) { console.warn('[Sentry] scrub error:', e.message); }
    return event;
  },
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    'AbortError',
    'The operation was aborted',
    'Network request failed',
  ],
});

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

// ── Mini-sprint madre 2026-04-23 · Hardening IPC ─────────────────────────────
// Validación estricta de payloads + allowlist open-external. Evita que un
// renderer comprometido persista basura en session o redirija a dominios
// arbitrarios.

const UUID_RE  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT_RE   = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSessionPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { accessToken, refreshToken, expiresAt, userId, email, name, role } = payload;

  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4000) return null;
  if (!JWT_RE.test(accessToken)) return null;
  if (typeof refreshToken !== 'string' || refreshToken.length < 10 || refreshToken.length > 4000) return null;

  const exp = (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0) ? expiresAt : null;

  return {
    accessToken,
    refreshToken,
    expiresAt: exp,
    userId:  (typeof userId === 'string' && UUID_RE.test(userId)) ? userId : null,
    email:   (typeof email === 'string' && EMAIL_RE.test(email) && email.length < 200) ? email : '',
    name:    typeof name === 'string' ? name.slice(0, 200) : '',
    role:    (typeof role === 'string' && ['owner','admin','staff','viewer'].includes(role)) ? role : 'viewer',
  };
}

// Allowlist madre: incluye todo lo del cliente + dashboards de admin (Supabase,
// Stripe, Resend, Railway, n8n, etc.) porque el founder legítimamente los visita.
const ALLOWED_EXTERNAL_HOSTS = new Set([
  // Dominios propios
  'dominiosystem.com', 'www.dominiosystem.com', 'app.dominiosystem.com', 'demo.dominiosystem.com',
  // Supabase
  'supabase.com', 'app.supabase.com', 'ywlyuuddqitduqtdttgo.supabase.co',
  // Meta / WhatsApp
  'web.whatsapp.com', 'business.whatsapp.com', 'business.facebook.com', 'developers.facebook.com', 'wa.me',
  // Admin dashboards que el founder usa
  'stripe.com', 'dashboard.stripe.com', 'checkout.stripe.com',
  'resend.com',
  'railway.app', 'railway.com',
  'cal.com', 'app.cal.com',
  'github.com', 'raw.githubusercontent.com',
  'vercel.com',
  // Finanzas/legal de LLC
  'mercury.com', 'app.mercury.com',
  'doola.com', 'app.doola.com',
  // n8n hosted
  'n8n-production-d3a5.up.railway.app',
]);
const ALLOWED_EXTERNAL_SUFFIXES = ['.dominiosystem.com', '.supabase.co', '.railway.app', '.vercel.app'];

function isExternalUrlAllowed(raw) {
  if (typeof raw !== 'string' || raw.length > 2000) return false;
  // Permitir mailto: para botones "email a soporte"
  if (raw.startsWith('mailto:') && /^mailto:[\w.+-]+@[\w-]+(\.[\w-]+)+$/i.test(raw)) return true;
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (ALLOWED_EXTERNAL_HOSTS.has(u.hostname)) return true;
  return ALLOWED_EXTERNAL_SUFFIXES.some(s => u.hostname.endsWith(s));
}

// ── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.on('login-success', (event, session) => {
  const safe = validateSessionPayload(session);
  if (!safe) {
    console.error('[IPC madre] login-success: payload inválido o malformado. Rechazado.');
    return;
  }
  currentSession = safe;
  persistSession(safe);
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
    const nextAccess = typeof fresh.access_token === 'string' && JWT_RE.test(fresh.access_token) ? fresh.access_token : null;
    if (!nextAccess) throw new Error('invalid_refresh_response');

    currentSession = {
      ...currentSession,
      accessToken: nextAccess,
      refreshToken: (typeof fresh.refresh_token === 'string' && fresh.refresh_token.length > 10)
        ? fresh.refresh_token
        : currentSession.refreshToken,
      expiresAt: (typeof fresh.expires_at === 'number' && Number.isFinite(fresh.expires_at))
        ? fresh.expires_at
        : (Math.floor(Date.now() / 1000) + (fresh.expires_in || 3600)),
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
  if (isExternalUrlAllowed(url)) {
    shell.openExternal(url);
  } else {
    console.warn('[IPC madre] open-external bloqueado (dominio no permitido):',
      typeof url === 'string' ? url.slice(0, 200) : typeof url);
  }
});

// ── Settings view · Fase 5 v1.0.7 ────────────────────────────────────────────
// app-info: devuelve metadata estática (versiones, paths, plataforma) para la
// vista Configuración. No expone nada sensible (ni access tokens ni session).
ipcMain.handle('app-info', () => ({
  appName: app.getName(),
  appVersion: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  platform: process.platform,
  arch: process.arch,
  userDataPath: app.getPath('userData'),
  isPackaged: app.isPackaged,
}));

// open-devtools: abre devtools del dashboard window. Útil cuando founder
// necesita ver consola sin tener que reabrir app con --dev.
ipcMain.on('open-devtools', () => {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.openDevTools({ mode: 'detach' });
  }
});

// check-updates: consulta GitHub Releases API por la última versión publicada
// y compara con app.getVersion(). Si el repo es privado o no tiene releases,
// devuelve estado 'unavailable' con mensaje legible.
//
// IMPORTANTE: hoy madre app NO tiene electron-updater configurado (post-LLC + Apple
// Developer ID). Esta función solo informa + abre el DMG en el navegador.
// Owner = `dominio-system` (mismo que cliente, repo `dominio-client-app`).
// El repo `dominio-madre-app` aún no existe / no es público — mientras no exista,
// la GitHub API devolverá 404 y la vista mostrará el mensaje "Releases no disponibles".
// Cuando crees el repo y publiques v1.0.7, esto empezará a funcionar automáticamente.
const GITHUB_REPO_OWNER = 'dominio-system';
const GITHUB_REPO_NAME  = 'dominio-madre-app';

ipcMain.handle('check-updates', async () => {
  const current = app.getVersion();
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Dominio-Madre' },
    });
    if (resp.status === 404) {
      return {
        status: 'unavailable',
        current,
        message: 'Releases públicas no disponibles todavía. La auto-actualización se activará tras Apple Developer ID (post-LLC).',
      };
    }
    if (!resp.ok) {
      return { status: 'error', current, message: `GitHub respondió ${resp.status}` };
    }
    const data = await resp.json();
    const latest = (data.tag_name || '').replace(/^v/i, '');
    if (!latest) return { status: 'error', current, message: 'Release sin tag_name' };

    const cmp = compareSemver(current, latest);
    const dmgAsset = (data.assets || []).find(a => /\.dmg$/i.test(a.name));
    return {
      status: cmp < 0 ? 'available' : 'up-to-date',
      current,
      latest,
      releaseNotes: data.body || '',
      releaseUrl: data.html_url || '',
      dmgUrl: dmgAsset ? dmgAsset.browser_download_url : (data.html_url || ''),
      dmgName: dmgAsset ? dmgAsset.name : null,
      publishedAt: data.published_at || null,
    };
  } catch (e) {
    return { status: 'error', current, message: e.message || 'Network error' };
  }
});

// Comparador semver simple (1.0.7 vs 1.0.10). Devuelve -1 si a<b, 0 si a==b, 1 si a>b.
function compareSemver(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

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
