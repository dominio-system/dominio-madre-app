// ============================================
// Dominio Madre · Topbar Extras (Migración v1.0.8)
// ============================================
// Implementa los 4 widgets nuevos que migramos del mockup v2:
//   1. TZ chip (hora local + sync indicator + Realtime flash)
//   2. Theme toggle dark/light
//   3. Help modal (atajos teclado + recursos + soporte)
//   4. Notification bell + drawer + filter
//   5. ⌘K Search overlay con resultados agrupados
//
// Dependencias:
//   - utils.js (escapeHtml)
//   - electronAPI (preload exposed: openExternal, openDevTools)
//   - go(view) global del dashboard
//   - toast(msg, kind) global del dashboard
//
// Notificaciones:
//   - Mock data por ahora (datos fake para desarrollo)
//   - En producción: Supabase Realtime sub a tabla `notifications`
//     (ver outputs/madre-notifications-schema.sql)
// ============================================

(function(global){
  'use strict';

  // ─── 1. TZ chip · auto-detect + override + sync indicator ───
  const TZ_LABEL = {
    'America/Mexico_City':      'MX-CITY',
    'America/Argentina/Buenos_Aires': 'BA',
    'America/New_York':         'NY',
    'America/Los_Angeles':      'LA',
    'Europe/Madrid':            'MAD',
    'UTC':                      'UTC',
  };
  let _lastSyncTs = Date.now();
  function getSystemTZ(){
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }
  function getActiveTZ(){
    let stored = null;
    try { stored = localStorage.getItem('madre-tz'); } catch(e){}
    return (stored && stored !== 'auto') ? stored : getSystemTZ();
  }
  function getTZLabel(tz){
    return TZ_LABEL[tz] || tz.split('/').pop().slice(0,7).toUpperCase();
  }
  function markRealtimeSync(){
    _lastSyncTs = Date.now();
    const chip = document.getElementById('tz-chip');
    if(chip){
      chip.classList.remove('flash');
      void chip.offsetWidth;  // reflow para reiniciar
      chip.classList.add('flash');
    }
  }
  function refreshTZUI(){
    const tz = getActiveTZ();
    const now = new Date();
    let timeStr = '--:--';
    try {
      timeStr = new Intl.DateTimeFormat('es-MX', {
        timeZone: tz, hour:'2-digit', minute:'2-digit', hour12:false
      }).format(now);
    } catch(e){}
    const label = getTZLabel(tz);
    const syncSec = Math.floor((Date.now() - _lastSyncTs) / 1000);
    const syncStr = syncSec < 60 ? `sync ${syncSec}s` : `sync ${Math.floor(syncSec/60)}m`;
    const tEl = document.getElementById('tz-time'); if(tEl) tEl.textContent = timeStr;
    const zEl = document.getElementById('tz-zone'); if(zEl) zEl.textContent = label;
    const sEl = document.getElementById('tz-sync'); if(sEl) sEl.textContent = syncStr;
  }
  // Auto-update cada segundo
  setInterval(refreshTZUI, 1000);
  refreshTZUI();

  global.MadreTZ = { getActiveTZ, getSystemTZ, markRealtimeSync, getTZLabel };
  global.markRealtimeSync = markRealtimeSync;  // alias para fácil llamado

  // ─── 2. Theme toggle ───
  function toggleTheme(){
    const isLight = document.body.classList.toggle('theme-light');
    const dark  = document.getElementById('theme-icon-dark');
    const light = document.getElementById('theme-icon-light');
    if(dark)  dark.style.display  = isLight ? 'none' : 'block';
    if(light) light.style.display = isLight ? 'block' : 'none';
    try { localStorage.setItem('madre-theme', isLight ? 'light' : 'dark'); } catch(e){}
    if(typeof global.toast === 'function') global.toast(`Tema ${isLight ? 'claro' : 'oscuro'}`, 'success');
  }
  // Restaurar tema al cargar
  try {
    if(localStorage.getItem('madre-theme') === 'light'){
      document.body.classList.add('theme-light');
      const dark  = document.getElementById('theme-icon-dark');
      const light = document.getElementById('theme-icon-light');
      if(dark)  dark.style.display  = 'none';
      if(light) light.style.display = 'block';
    }
  } catch(e){}
  global.toggleTheme = toggleTheme;

  // ─── 3. Help modal ───
  function openHelp(){ document.getElementById('help-overlay')?.classList.add('active'); }
  function closeHelp(){ document.getElementById('help-overlay')?.classList.remove('active'); }
  global.openHelp = openHelp;
  global.closeHelp = closeHelp;

  // ─── 4. Notifications · drawer + filter ───
  // Mock data inicial · TODO Fase 2: cargar desde Supabase + Realtime sub
  // Schema esperado: ver madre-notifications-schema.sql (v_notifications_for_me)
  const MOCK_NOTIFS = [
    { id:1, kind:'critical', cat:'business', icon:'$', title:'Pago fallido · cliente_8a3f',
      body:'Stripe rechazó cobro · dunning automático activado · $149',
      meta:'hace 12m · DUNNING', unread:true },
    { id:2, kind:'ok', cat:'business', icon:'+', title:'Nuevo cliente Pro',
      body:'Estudio Lavalle activó suscripción · MRR +$149/mes',
      meta:'hace 35m · CONVERSION', unread:true },
    { id:3, kind:'warn', cat:'aria', icon:'A', title:'Lead caliente sin contactar',
      body:'+5491167… intent score 0.92 · espera 2h',
      meta:'hace 2h · ARIA', unread:true },
    { id:4, kind:'info', cat:'system', icon:'↻', title:'Auto-deploy n8n DS2-04',
      body:'Build #234 desplegado · 7 nodos actualizados',
      meta:'hace 1d · DEPLOY', unread:false },
    { id:5, kind:'info', cat:'system', icon:'⚙', title:'Madre v1.0.8 disponible',
      body:'Migración mockup → producción · widgets nuevos',
      meta:'hoy · UPDATE', unread:false },
  ];
  let NOTIFS = MOCK_NOTIFS.slice();
  let drawerFilter = 'all';

  function getFilteredNotifs(){
    if(drawerFilter === 'all')      return NOTIFS;
    if(drawerFilter === 'unread')   return NOTIFS.filter(n => n.unread);
    if(drawerFilter === 'critical') return NOTIFS.filter(n => n.kind === 'critical');
    if(drawerFilter === 'business') return NOTIFS.filter(n => n.cat === 'business');
    if(drawerFilter === 'system')   return NOTIFS.filter(n => n.cat === 'system');
    return NOTIFS;
  }

  function renderNotifList(){
    const list = document.getElementById('notif-list');
    if(!list) return;
    const items = getFilteredNotifs().slice(0, 10);
    if(items.length === 0){
      list.innerHTML = `<div style="text-align:center;padding:30px 14px;color:var(--text3);font-size:11px;">Sin notificaciones en este filtro</div>`;
      return;
    }
    const escape = (s) => global.MadreUtils?.escapeHtml ? global.MadreUtils.escapeHtml(s) : String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    list.innerHTML = items.map(n => `
      <div class="notif-card ${n.unread ? 'unread' : ''}" data-id="${n.id}" onclick="markNotifRead(${n.id})">
        <button class="notif-card-dismiss" onclick="event.stopPropagation();dismissNotif(${n.id});" title="Descartar">×</button>
        <div class="notif-row">
          <div class="notif-icon ${n.kind === 'critical' ? 'danger' : n.kind}">${escape(n.icon)}</div>
          <div class="notif-body">
            <div class="notif-card-title">${escape(n.title)}</div>
            <div class="notif-meta">${escape(n.meta)}</div>
            <div class="notif-body-text">${escape(n.body)}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  function updateBadges(){
    const unread = NOTIFS.filter(n => n.unread).length;
    const badge = document.getElementById('notif-badge');
    if(badge){
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }
    const bell = document.getElementById('notif-bell');
    if(bell) bell.classList.toggle('has-notif', unread > 0);
    const sub = document.getElementById('notif-sub');
    if(sub) sub.textContent = unread === 0 ? 'todo leído' : `${unread} sin leer · live`;
  }

  function toggleNotif(){
    const open = document.body.classList.toggle('notif-open');
    if(open) renderNotifList();
  }
  function closeNotif(){ document.body.classList.remove('notif-open'); }
  function filterNotifs(f){
    drawerFilter = f;
    document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    renderNotifList();
  }
  function markNotifRead(id){
    const n = NOTIFS.find(x => x.id === id);
    if(n && n.unread){ n.unread = false; updateBadges(); renderNotifList(); }
  }
  function markAllNotifsRead(){
    NOTIFS.forEach(n => n.unread = false);
    updateBadges(); renderNotifList();
    if(typeof global.toast === 'function') global.toast('Todas marcadas como leídas', 'success');
  }
  function dismissNotif(id){
    const idx = NOTIFS.findIndex(x => x.id === id);
    if(idx >= 0){ NOTIFS.splice(idx, 1); updateBadges(); renderNotifList(); }
  }

  global.toggleNotif = toggleNotif;
  global.closeNotif = closeNotif;
  global.filterNotifs = filterNotifs;
  global.markNotifRead = markNotifRead;
  global.markAllNotifsRead = markAllNotifsRead;
  global.dismissNotif = dismissNotif;

  // Init
  updateBadges();

  // ─── 5. ⌘K Search overlay · resultados agrupados ───
  // Mock index · TODO Fase 2: indexar desde Supabase (clientes/leads/invoices/audit)
  const SEARCH_INDEX = [
    { cat:'config',  icon:'⚙', title:'Configuración',         sub:'cuenta · updates · sistema',         view:'settings' },
    { cat:'config',  icon:'⚙', title:'Buscar actualizaciones',sub:'check GitHub Releases',              view:'settings' },
    { cat:'system',  icon:'S', title:'System Status',         sub:'uptime · services · latencia',       view:'status' },
    { cat:'system',  icon:'A', title:'Audit log',             sub:'últimas 100 acciones',               view:'audit' },
    { cat:'system',  icon:'I', title:'Incidencias',           sub:'historial de incidents',             view:'incidents' },
    { cat:'team',    icon:'U', title:'Usuarios',              sub:'team members + invitaciones',        view:'users' },
    { cat:'team',    icon:'R', title:'Roles & Permisos',      sub:'RBAC custom',                        view:'roles' },
    { cat:'biz',     icon:'$', title:'Revenue & MRR',         sub:'analytics business',                 view:'revenue' },
    { cat:'biz',     icon:'$', title:'Invoices',              sub:'facturas Stripe',                    view:'invoices' },
    { cat:'biz',     icon:'$', title:'Subscriptions',         sub:'subs activas · churn',               view:'subs' },
    { cat:'biz',     icon:'$', title:'Dunning',               sub:'cobranza · payments fallidos',       view:'dunning' },
    { cat:'biz',     icon:'$', title:'Payouts',               sub:'pagos enviados',                     view:'payouts' },
    { cat:'ops',     icon:'F', title:'Funnel Maestro',        sub:'90d · conversión por fuente',        view:'funnel' },
    { cat:'ops',     icon:'L', title:'Lead Sources',          sub:'UTM tracking · attribution',         view:'leads' },
    { cat:'ops',     icon:'C', title:'Clientes',              sub:'12 activos · heat-bars',             view:'clients' },
    { cat:'plat',    icon:'I', title:'Integraciones',         sub:'Stripe · n8n · Resend',              view:'integrations' },
    { cat:'plat',    icon:'K', title:'API & Keys',            sub:'gestión de API keys',                view:'keys' },
    { cat:'plat',    icon:'W', title:'Webhooks',              sub:'eventos salientes',                  view:'webhooks' },
    { cat:'soporte', icon:'T', title:'Tickets',               sub:'queue de soporte',                   view:'tickets' },
    { cat:'soporte', icon:'D', title:'Documentación',         sub:'KB interna',                         view:'docs' },
  ];
  const CAT_LABEL = {
    config:'CONFIGURACIÓN', system:'SISTEMA', team:'EQUIPO',
    biz:'NEGOCIO', ops:'OPERACIÓN', plat:'PLATAFORMA', soporte:'SOPORTE',
  };
  let _searchKbdIdx = 0;

  function openSearch(){
    document.getElementById('search-overlay')?.classList.add('active');
    const inp = document.getElementById('search-input');
    if(inp){ inp.value=''; inp.focus(); }
    _searchKbdIdx = 0;
    renderSearchResults();
  }
  function closeSearch(){ document.getElementById('search-overlay')?.classList.remove('active'); }
  function renderSearchResults(){
    const q = (document.getElementById('search-input')?.value || '').trim().toLowerCase();
    const results = !q
      ? SEARCH_INDEX.slice(0, 12)
      : SEARCH_INDEX.filter(r => (r.title + ' ' + r.sub).toLowerCase().includes(q));
    const out = document.getElementById('search-results');
    if(!out) return;
    if(!results.length){
      out.innerHTML = `<div class="search-empty">Sin resultados para "${q}"</div>`;
      out._flat = [];
      return;
    }
    const byCat = {};
    results.forEach(r => { (byCat[r.cat] = byCat[r.cat] || []).push(r); });
    let html = '';
    let idx = 0;
    for(const cat in byCat){
      html += `<div class="search-cat">${CAT_LABEL[cat] || cat.toUpperCase()}</div>`;
      byCat[cat].forEach(r => {
        const active = idx === _searchKbdIdx ? 'kbd-active' : '';
        html += `
          <div class="search-item ${active}" data-i="${idx}" onclick="searchPick(${idx})">
            <div class="search-item-icon">${r.icon}</div>
            <div class="search-item-body">
              <div class="search-item-title">${r.title}</div>
              <div class="search-item-sub">${r.sub}</div>
            </div>
            <div class="search-item-arrow">↵</div>
          </div>`;
        idx++;
      });
    }
    out.innerHTML = html;
    out._flat = results;
    if(_searchKbdIdx >= results.length) _searchKbdIdx = 0;
  }
  function searchKeyNav(e){
    const out = document.getElementById('search-results');
    const flat = out?._flat || [];
    if(e.key === 'ArrowDown'){
      e.preventDefault();
      _searchKbdIdx = (_searchKbdIdx + 1) % Math.max(1, flat.length);
      renderSearchResults();
    } else if(e.key === 'ArrowUp'){
      e.preventDefault();
      _searchKbdIdx = (_searchKbdIdx - 1 + flat.length) % Math.max(1, flat.length);
      renderSearchResults();
    } else if(e.key === 'Enter'){
      e.preventDefault();
      searchPick(_searchKbdIdx);
    }
  }
  function searchPick(i){
    const flat = document.getElementById('search-results')?._flat || [];
    const r = flat[i];
    if(!r) return;
    closeSearch();
    if(r.view && typeof global.go === 'function') global.go(r.view);
  }

  global.openSearch = openSearch;
  global.closeSearch = closeSearch;
  global.renderSearchResults = renderSearchResults;
  global.searchKeyNav = searchKeyNav;
  global.searchPick = searchPick;

  // ─── Atajos de teclado globales ───
  document.addEventListener('keydown', (e) => {
    // ⌘K · search
    if((e.metaKey || e.ctrlKey) && e.key === 'k'){
      e.preventDefault();
      openSearch();
    }
    // ⌘\ · sidebar collapse (solo si toggleSidebar existe en el HTML)
    if((e.metaKey || e.ctrlKey) && e.key === '\\'){
      e.preventDefault();
      if(typeof global.toggleSidebar === 'function') global.toggleSidebar();
    }
    // ? · help
    if(e.key === '?' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){
      e.preventDefault();
      openHelp();
    }
    // esc · cierra todo
    if(e.key === 'Escape'){
      closeNotif();
      closeHelp();
      closeSearch();
    }
  });
})(window);
