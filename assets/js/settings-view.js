// ============================================
// Dominio Madre · Vista Configuración (Fase 5 v1.0.7)
// ============================================
// 5 secciones:
//   1. Cuenta            — usuario logueado · cerrar sesión
//   2. Aplicación        — versión + buscar/descargar updates (GitHub Releases)
//   3. Sistema           — limpiar caché · DevTools · exportar audit_log CSV
//   4. Acerca de         — info de versión / Electron / Node / userData path
//   5. Acerca de         — Electron / Chromium / Node / V8 / arch / userData
//
// Limitación intencional: NO hay auto-install (electron-updater no integrado
// hasta tener Apple Developer ID post-LLC). El "descargar update" abre el DMG
// en el navegador → user descarga manual → instala manual.
// ============================================

(function(global){
  'use strict';

  const { escapeHtml } = global.MadreUtils;

  const SettingsView = {
    _appInfo: null,
    _updateState: null,  // { status, current, latest, ... }
    _session: null,      // sesión completa via electronAPI.getSession()

    async render(){
      const view = document.querySelector('.view[data-view="settings"]');
      if(!view) return;

      // Estructura base si la vista está vacía
      if(!view.querySelector('.settings-grid')){
        view.innerHTML = `
          <div class="page-head">
            <div>
              <div class="page-title">Configuración</div>
              <div class="page-sub">SISTEMA · PREFERENCIAS Y MANTENIMIENTO</div>
            </div>
          </div>
          <div class="settings-grid" style="display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));">
            <div class="panel" id="set-cuenta"></div>
            <div class="panel" id="set-app"></div>
            <div class="panel" id="set-sistema"></div>
            <div class="panel" id="set-about" style="grid-column:1/-1;"></div>
          </div>
        `;
      }

      // Cargar app-info + session en paralelo
      try {
        const [info, sess] = await Promise.all([
          global.electronAPI.appInfo().catch(() => null),
          global.electronAPI.getSession().catch(() => null),
        ]);
        this._appInfo = info;
        this._session = sess;
      } catch(err){
        console.warn('[SettingsView] load:', err.message || err);
      }

      this.renderCuenta();
      this.renderApp();
      this.renderSistema();
      this.renderAbout();
    },

    // ─── 1. Cuenta ─────────────────────────────────────────────
    renderCuenta(){
      const el = document.getElementById('set-cuenta');
      if(!el) return;
      const u = this._session || (typeof window.USER === 'object' ? window.USER : {}) || {};
      const role = u.roleLabel || u.role || '—';
      const initial = (u.fullName || u.email || '?').charAt(0).toUpperCase();
      // Avatar guardado (dataURL en localStorage · TODO migrar a bucket Supabase)
      let storedAvatar = null;
      try { storedAvatar = localStorage.getItem('madre-avatar'); } catch(e){}
      const avatarContent = storedAvatar
        ? `<img src="${storedAvatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : escapeHtml(initial);
      el.innerHTML = `
        <div class="panel-head">
          <div class="panel-title">Cuenta</div>
        </div>
        <div style="padding:18px;">
          <div style="display:flex;align-items:center;gap:18px;margin-bottom:14px;">
            <div style="position:relative;flex-shrink:0;">
              <div id="set-avatar-preview" style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--card2),var(--card3));border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:var(--text2);overflow:hidden;letter-spacing:-1px;">
                ${avatarContent}
              </div>
              <button id="set-avatar-btn" style="position:absolute;bottom:-2px;right:-2px;width:24px;height:24px;border-radius:50%;background:var(--card3);border:2px solid var(--bg);color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;" title="Cambiar foto">
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 5h2l1-1.5h4L10 5h2v6H2z"/><circle cx="7" cy="8" r="2"/></svg>
              </button>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;margin-bottom:3px;">${escapeHtml(u.fullName || u.email || 'Usuario')}</div>
              <div class="dim" style="font-size:11px;font-family:'Geist Mono',monospace;margin-bottom:8px;">${escapeHtml(u.email || '—')}</div>
              <span class="chip"><span class="chip-dot"></span>Rol: <strong style="margin-left:4px;">${escapeHtml(role)}</strong></span>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--border);padding-top:14px;">
            <input type="file" id="set-avatar-file" accept="image/png,image/jpeg,image/webp" style="display:none;">
            <button class="btn ghost" id="set-avatar-change" style="font-size:11px;">Cambiar foto</button>
            ${storedAvatar ? `<button class="btn ghost" id="set-avatar-remove" style="font-size:11px;color:var(--danger);">Quitar foto</button>` : ''}
            <span class="dim" style="font-size:10px;flex:1;text-align:right;">PNG, JPG o WebP · máx 2 MB</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;">
            <button class="btn ghost" id="set-logout" style="font-size:11px;">Cerrar sesión</button>
          </div>
        </div>
      `;
      // Hooks
      const fileInput = document.getElementById('set-avatar-file');
      const triggerPick = () => fileInput?.click();
      document.getElementById('set-avatar-btn')?.addEventListener('click', triggerPick);
      document.getElementById('set-avatar-change')?.addEventListener('click', triggerPick);
      document.getElementById('set-avatar-remove')?.addEventListener('click', () => {
        if(!confirm('¿Quitar foto de perfil?')) return;
        try { localStorage.removeItem('madre-avatar'); } catch(e){}
        this.renderCuenta();
        global.toast?.('Foto eliminada', 'warn');
      });
      fileInput?.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if(!file) return;
        if(file.size > 2 * 1024 * 1024){
          global.toast?.('Imagen mayor a 2 MB', 'err');
          return;
        }
        if(!/^image\/(png|jpe?g|webp)$/i.test(file.type)){
          global.toast?.('Solo PNG, JPG o WebP', 'err');
          return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            localStorage.setItem('madre-avatar', ev.target.result);
            this.renderCuenta();
            global.toast?.('Foto actualizada', 'success');
          } catch(err){
            global.toast?.('No se pudo guardar (storage lleno?)', 'err');
          }
        };
        reader.readAsDataURL(file);
      });
      const btn = document.getElementById('set-logout');
      if(btn) btn.onclick = () => {
        if(confirm('¿Cerrar sesión y volver al login?')){
          global.electronAPI?.logout();
        }
      };
    },

    // ─── 2. Aplicación (updates) ──────────────────────────────
    renderApp(){
      const el = document.getElementById('set-app');
      if(!el) return;
      const current = this._appInfo?.appVersion || '?';
      const state = this._updateState;
      let updateBlock = '';
      if(!state){
        updateBlock = `<div class="dim" style="font-size:11px;">No has buscado actualizaciones todavía.</div>`;
      } else if(state.status === 'up-to-date'){
        updateBlock = `<div style="color:var(--success);font-size:12px;">✓ Estás en la última versión (v${escapeHtml(state.latest)})</div>`;
      } else if(state.status === 'available'){
        const notes = (state.releaseNotes || '').slice(0, 600);
        // v1.0.24 · Solo mostrar botón Descargar si hay DMG disponible para la arquitectura
        const hasDmg = !!state.dmgUrl;
        const sizeMB = state.dmgSize ? Math.round(state.dmgSize / 1048576) : null;
        const archLabel = state.arch === 'arm64' ? 'Apple Silicon' : 'Intel';
        const downloadButton = hasDmg
          ? `<button class="btn primary" id="set-download-dmg" style="font-size:11px;">⬇ Descargar DMG${sizeMB ? ` · ${sizeMB} MB` : ''} (${archLabel})</button>`
          : `<div style="font-size:11px;color:var(--warn);background:rgba(255,176,32,0.10);border:1px solid rgba(255,176,32,0.30);border-radius:5px;padding:8px 10px;">⚠ DMG aún no disponible para tu arquitectura (${archLabel}). El upload del binario al release todavía no termina · vuelve en unos minutos.</div>`;
        updateBlock = `
          <div style="background:rgba(111,207,151,0.08);border:1px solid rgba(111,207,151,0.25);border-radius:6px;padding:10px;font-size:12px;">
            <div style="font-weight:600;color:var(--success);">Nueva versión disponible: v${escapeHtml(state.latest)}</div>
            ${state.publishedAt ? `<div class="dim" style="font-size:10px;margin-top:2px;">Publicada ${new Date(state.publishedAt).toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'})}</div>` : ''}
            ${notes ? `<pre style="margin:8px 0 0;white-space:pre-wrap;font-family:'Geist Mono',monospace;font-size:10px;line-height:1.5;color:var(--text2);max-height:140px;overflow:auto;">${escapeHtml(notes)}${state.releaseNotes && state.releaseNotes.length > 600 ? '…' : ''}</pre>` : ''}
            <div style="margin-top:10px;">
              ${downloadButton}
            </div>
          </div>
        `;
      } else if(state.status === 'unavailable'){
        updateBlock = `<div class="dim" style="font-size:11px;line-height:1.5;">${escapeHtml(state.message || 'Updates no disponibles')}</div>`;
      } else {
        updateBlock = `<div style="color:var(--danger);font-size:11px;">Error: ${escapeHtml(state.message || 'desconocido')}</div>`;
      }

      el.innerHTML = `
        <div class="panel-head">
          <div class="panel-title">Aplicación</div>
        </div>
        <div style="padding:18px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;">
            <span class="dim">Versión actual</span>
            <strong style="font-family:'Geist Mono',monospace;">v${escapeHtml(current)}</strong>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button class="btn primary" id="set-check-updates" style="font-size:11px;">Buscar actualizaciones</button>
            <span class="dim" id="set-check-status" style="font-size:10px;"></span>
          </div>
          <div id="set-update-block" style="margin-top:4px;">${updateBlock}</div>
          <div class="dim" style="font-size:10px;line-height:1.5;border-top:1px solid var(--border);padding-top:10px;">
            <strong>Nota:</strong> hoy la auto-instalación no está activa. Tras descargar el DMG hay que arrastrar la app al <code>/Applications</code> manualmente. La auto-actualización se habilitará tras Apple Developer ID (post-LLC).
          </div>
        </div>
      `;

      const checkBtn = document.getElementById('set-check-updates');
      if(checkBtn) checkBtn.onclick = () => this.checkForUpdates();
      const dlBtn = document.getElementById('set-download-dmg');
      if(dlBtn && state?.dmgUrl) dlBtn.onclick = () => {
        // dmgUrl es el browser_download_url directo de GitHub Releases
        // GitHub responde con redirect 302 al CDN, el navegador descarga el archivo automáticamente.
        global.electronAPI?.openExternal(state.dmgUrl);
        global.toast?.(`Descarga iniciada · ${state.dmgName || 'DMG'}`, 'success');
      };
    },

    async checkForUpdates(){
      const status = document.getElementById('set-check-status');
      const btn = document.getElementById('set-check-updates');
      if(btn){ btn.disabled = true; }
      if(status){ status.textContent = '· consultando GitHub…'; }
      try {
        this._updateState = await global.electronAPI.checkUpdates();
      } catch(err){
        this._updateState = { status: 'error', message: err.message || 'Network error' };
      }
      this.renderApp();
    },

    // ─── 3. Sistema ────────────────────────────────────────────
    renderSistema(){
      const el = document.getElementById('set-sistema');
      if(!el) return;
      el.innerHTML = `
        <div class="panel-head">
          <div class="panel-title">Sistema</div>
        </div>
        <div style="padding:18px;display:flex;flex-direction:column;gap:10px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div>Limpiar caché en memoria</div>
              <div class="dim" style="font-size:10px;">Fuerza recarga de v_command_center, v_clients_full, etc. Útil si ves datos viejos.</div>
            </div>
            <button class="btn ghost" id="set-cache-clear" style="font-size:11px;">Limpiar</button>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div>Abrir DevTools</div>
              <div class="dim" style="font-size:10px;">Consola de errores + inspector. Solo para debugging.</div>
            </div>
            <button class="btn ghost" id="set-devtools" style="font-size:11px;">Abrir</button>
          </div>
          <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div>Exportar audit_log (CSV)</div>
              <div class="dim" style="font-size:10px;">Últimas 1000 acciones. Solo para auditoría externa.</div>
            </div>
            <button class="btn ghost" id="set-export-audit" style="font-size:11px;">Exportar</button>
          </div>
        </div>
      `;
      const cBtn = document.getElementById('set-cache-clear');
      if(cBtn) cBtn.onclick = () => this.clearCache();
      const dBtn = document.getElementById('set-devtools');
      if(dBtn) dBtn.onclick = () => global.electronAPI?.openDevTools();
      const eBtn = document.getElementById('set-export-audit');
      if(eBtn) eBtn.onclick = () => this.exportAuditCsv(eBtn);
    },

    clearCache(){
      try {
        // MadreCache.invalidate() sin prefijo limpia todo el Map (madre-polish.js:34)
        if(global.MadreCache && typeof global.MadreCache.invalidate === 'function'){
          global.MadreCache.invalidate();
        }
        global.toast?.('Caché limpiada · recarga la vista para ver datos frescos', 'success');
      } catch(err){
        global.toast?.('Error al limpiar caché: ' + (err.message || err), 'err');
      }
    },

    async exportAuditCsv(btn){
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = '· exportando…';
      try {
        const rows = await global.sbGet('audit_log', 'order=created_at.desc&limit=1000&select=created_at,actor_email,action,entity_type,entity_id,result');
        if(!Array.isArray(rows) || rows.length === 0){
          global.toast?.('No hay entries en audit_log', 'warn');
          return;
        }
        const headers = ['created_at','actor_email','action','entity_type','entity_id','result'];
        const escapeCsv = (v) => {
          if(v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        };
        const csv = [
          headers.join(','),
          ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(',')),
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        global.toast?.(`Exportadas ${rows.length} filas`, 'success');
      } catch(err){
        global.toast?.('Error: ' + (err.message || err), 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    },

    // ─── 4. Acerca de ─────────────────────────────────────────
    // (panel Conexiones eliminado v1.0.24 · no aporta valor operativo · si necesitas
    //  ver salud de servicios usa la sección "Estado del Sistema" del sidebar)
    renderAbout(){
      const el = document.getElementById('set-about');
      if(!el) return;
      const i = this._appInfo || {};
      const items = [
        ['App',           i.appName || 'Dominio Corporativo'],
        ['Versión',       'v' + (i.appVersion || '?')],
        ['Plataforma',    `${i.platform || '?'} · ${i.arch || '?'}`],
        ['Electron',      i.electron || '—'],
        ['Chromium',      i.chrome || '—'],
        ['Node',          i.node || '—'],
        ['V8',            i.v8 || '—'],
        ['Empaquetada',   i.isPackaged ? 'sí (DMG)' : 'no (dev)'],
      ];
      el.innerHTML = `
        <div class="panel-head">
          <div class="panel-title">Acerca de</div>
        </div>
        <div style="padding:18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px 24px;font-size:11px;">
          ${items.map(([k,v]) => `
            <div>
              <div class="dim" style="text-transform:uppercase;letter-spacing:0.5px;font-size:9px;">${escapeHtml(k)}</div>
              <div style="font-family:'Geist Mono',monospace;margin-top:2px;">${escapeHtml(v)}</div>
            </div>
          `).join('')}
        </div>
        <div style="padding:0 18px 18px;font-size:10px;line-height:1.6;color:var(--text3);border-top:1px solid var(--border);padding-top:12px;margin-top:4px;">
          © 2026 Dominio System · automation plattform<br>
          ${i.userDataPath ? `<span class="dim">userData: <code>${escapeHtml(i.userDataPath)}</code></span>` : ''}
        </div>
      `;
    },
  };

  global.SettingsView = SettingsView;
})(window);
