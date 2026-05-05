// ============================================
// Dominio Madre · Polish (Fase 4)
// ============================================
// - Command Center cards con data real (antes hardcoded)
// - Mini-bars desde v_kpi_sparkline
// - Feed global desde v_global_activity_feed
// - Lista Clientes con heat-bars reales + leads + paginación
// - Caché local 60s
// - Realtime subscriptions (invoices, tickets, notifications, leads, appointments)
//
// Todo self-contained. Se integra con el script inline existente sin tocarlo.

(function(global){
  'use strict';

  // ══════════════════════════════════════════
  // CACHE (TTL 60s por key)
  // ══════════════════════════════════════════
  const Cache = {
    _store: new Map(),
    ttl: 60000,

    async get(key, fetcher){
      const cached = this._store.get(key);
      if(cached && (Date.now() - cached.t) < this.ttl){
        return cached.v;
      }
      const v = await fetcher();
      this._store.set(key, { v, t: Date.now() });
      return v;
    },

    invalidate(prefix = ''){
      if(!prefix){ this._store.clear(); return; }
      for(const k of this._store.keys()){
        if(k.startsWith(prefix)) this._store.delete(k);
      }
    }
  };
  global.MadreCache = Cache;

  // ══════════════════════════════════════════
  // COMMAND CENTER POLISH
  // ══════════════════════════════════════════
  async function loadCommandCenterReal(){
    try {
      const [cc, sparkline] = await Promise.all([
        // Fase 4 v1.0.6 · `&limit=1` evita transferir filas extra si la vista
        // alguna vez devuelve >1 row. `r?.[0] || null` (no `{}`) hace que el
        // guard `if(!cc)` abajo realmente dispare cuando no hay filas.
        Cache.get('v_command_center', () => global.sbGet('v_command_center', 'select=*&limit=1').then(r => r?.[0] || null)),
        Cache.get('v_kpi_sparkline', () => global.sbGet('v_kpi_sparkline', 'select=*&order=day').catch(()=>[]))
      ]);

      if(!cc){
        console.warn('[polish] v_command_center vacío · skipping render (la vista probablemente no tiene datos todavía)');
        return;
      }
      const $ = (id) => document.getElementById(id);
      const fmt = (n) => '$' + Math.round(Number(n)||0).toLocaleString('en');
      const num = (n) => Number(n) || 0;  // null/undefined/NaN → 0

      // KPI strip (Command Center)
      if($('kpi-revenue')) $('kpi-revenue').textContent = fmt(cc.mrr_total);
      if($('kpi-mrr'))     $('kpi-mrr').textContent     = fmt(cc.mrr_total);
      if($('kpi-clients')) $('kpi-clients').textContent = num(cc.active_clients);
      if($('kpi-churn'))   $('kpi-churn').textContent   = num(cc.churn_rate_pct) + '%';
      if($('kpi-clients-trend')) $('kpi-clients-trend').textContent = `${num(cc.active_clients)} activos`;

      // Card OPERACION
      if($('cc-leads')) $('cc-leads').textContent = cc.leads_30d || 0;
      if($('cc-citas')) $('cc-citas').textContent = cc.citas_30d || 0;
      if($('cc-conv'))  $('cc-conv').textContent  = (cc.conv_rate_pct || 0) + '%';

      // Card NEGOCIO
      if($('cc-revenue')) $('cc-revenue').textContent = fmt(cc.mrr_total);
      if($('cc-arr'))     $('cc-arr').textContent     = fmt(cc.arr_total);
      if($('cc-rpc'))     $('cc-rpc').textContent     = fmt(cc.arpu);

      // Mini-bars reales desde sparkline · null-safe (sparkline puede ser [] si la vista no devolvió filas)
      const sl = Array.isArray(sparkline) ? sparkline : [];
      patchMiniBars('cc-card-operacion',  sl.map(d => num(d.leads) + num(d.appointments)));
      patchMiniBars('cc-card-negocio',    sl.map(d => num(d.revenue)));
      patchMiniBars('cc-card-plataforma', sl.map(d => num(d.clients_new)));
      patchMiniBars('cc-card-sistema',    sl.map(() => 10)); // uptime, fijo
      patchMiniBars('cc-card-soporte',    sl.map(d => num(d.tickets_new)));

      // Card PLATAFORMA · integraciones
      patchPlatformCard(cc);

      // Card SISTEMA · uptime real
      patchSystemCard(cc);

      // Card ORGANIZACION · team
      patchTeamCard(cc);

      // Card SOPORTE · tickets
      patchSupportCard(cc);

      // Feed global (reemplaza el básico del loadData existente)
      await refreshFeed();

    } catch(err){
      console.warn('[polish] loadCommandCenter:', err);
    }
  }

  function patchPlatformCard(cc){
    const card = document.querySelector('.cc-card[onclick*="integrations"]');
    if(!card) return;
    const valEl = card.querySelector('.cc-value');
    const unitEl = card.querySelector('.cc-unit');
    const statusEl = card.querySelector('.cc-status');
    const metas = card.querySelectorAll('.cc-meta-val');
    if(valEl)  valEl.textContent  = cc.total_integrations || 0;
    if(unitEl) unitEl.textContent = 'integraciones';
    if(statusEl){
      if(cc.errored_integrations > 0){
        statusEl.className = 'cc-status err';
        statusEl.innerHTML = '<span class="d"></span>ERROR';
      } else if(cc.active_integrations > 0){
        statusEl.className = 'cc-status ok';
        statusEl.innerHTML = '<span class="d"></span>OK';
      } else {
        statusEl.className = 'cc-status warn';
        statusEl.innerHTML = '<span class="d"></span>CONFIG';
      }
    }
    if(metas[0]) metas[0].textContent = cc.active_integrations || 0;
    if(metas[1]) metas[1].textContent = cc.errored_integrations || 0;
    // Cambiar labels
    const metaLabels = card.querySelectorAll('.cc-meta-label');
    if(metaLabels[0]) metaLabels[0].textContent = 'ACTIVAS';
    if(metaLabels[1]) metaLabels[1].textContent = 'ERROR';
  }

  function patchSystemCard(cc){
    const card = document.querySelector('.cc-card[onclick*="status"]');
    if(!card) return;
    const valEl = card.querySelector('.cc-value');
    const unitEl = card.querySelector('.cc-unit');
    const statusEl = card.querySelector('.cc-status');
    const metas = card.querySelectorAll('.cc-meta-val');
    const metaLabels = card.querySelectorAll('.cc-meta-label');
    if(valEl){
      valEl.textContent = cc.uptime_pct_30d != null ? cc.uptime_pct_30d + '%' : '—';
    }
    if(unitEl) unitEl.textContent = 'uptime 30d';
    if(statusEl){
      if(cc.open_incidents > 0){
        statusEl.className = 'cc-status err';
        statusEl.innerHTML = '<span class="d"></span>INCIDENT';
      } else if((cc.uptime_pct_30d || 100) < 99){
        statusEl.className = 'cc-status warn';
        statusEl.innerHTML = '<span class="d"></span>DEGRADED';
      } else {
        statusEl.className = 'cc-status ok';
        statusEl.innerHTML = '<span class="d"></span>OK';
      }
    }
    if(metas[0]) metas[0].textContent = cc.open_incidents || 0;
    if(metas[1]) metas[1].textContent = cc.services_monitored || 0;
    if(metaLabels[0]) metaLabels[0].textContent = 'INCID.';
    if(metaLabels[1]) metaLabels[1].textContent = 'SERVICES';
  }

  function patchTeamCard(cc){
    const card = document.querySelector('.cc-card[onclick*="users"]');
    if(!card) return;
    const valEl = card.querySelector('.cc-value');
    const unitEl = card.querySelector('.cc-unit');
    const metas = card.querySelectorAll('.cc-meta-val');
    if(valEl)  valEl.textContent  = cc.active_members || 0;
    if(unitEl) unitEl.textContent = (cc.active_members === 1 ? 'miembro' : 'miembros');
    if(metas[0]) metas[0].textContent = (global.RBAC?.roleLabel() || 'OWNER');
    if(metas[1]) metas[1].textContent = cc.total_roles || 0;
  }

  function patchSupportCard(cc){
    const card = document.querySelector('.cc-card[onclick*="tickets"]');
    if(!card) return;
    const valEl = card.querySelector('.cc-value');
    const unitEl = card.querySelector('.cc-unit');
    const statusEl = card.querySelector('.cc-status');
    const metas = card.querySelectorAll('.cc-meta-val');
    const metaLabels = card.querySelectorAll('.cc-meta-label');
    if(valEl)  valEl.textContent  = cc.open_tickets || 0;
    if(unitEl) unitEl.textContent = cc.open_tickets === 1 ? 'ticket abierto' : 'tickets abiertos';
    if(statusEl){
      if(cc.sla_breach > 0){
        statusEl.className = 'cc-status err';
        statusEl.innerHTML = '<span class="d"></span>SLA!';
      } else if(cc.open_tickets > 0){
        statusEl.className = 'cc-status warn';
        statusEl.innerHTML = '<span class="d"></span>OPEN';
      } else {
        statusEl.className = 'cc-status ok';
        statusEl.innerHTML = '<span class="d"></span>OK';
      }
    }
    if(metas[0]) metas[0].textContent = cc.sla_breach || 0;
    if(metas[1]) metas[1].textContent = cc.resolved_tickets_30d || 0;
    if(metaLabels[0]) metaLabels[0].textContent = 'SLA!';
    if(metaLabels[1]) metaLabels[1].textContent = 'RESOLVED';
  }

  function patchMiniBars(_cardSelector, series){
    // Cada cc-card tiene .mini-bars con data-bars="n,n,n,..."
    // Buscamos la primera card (loadCommandCenter ya renderBars sobre el HTML)
    // Aquí reemplazamos el atributo y forzamos re-render
    const safe = Array.isArray(series) ? series.filter(x => x != null && !isNaN(Number(x))).map(Number) : [];
    if(safe.length === 0) return;
    // Identificar card por data-view en onclick (hack pero preciso)
    // Asumimos que las cards están en .cc-grid en orden: operacion, negocio, plataforma, organizacion, sistema, soporte
    const orderMap = {
      'cc-card-operacion':  0,
      'cc-card-negocio':    1,
      'cc-card-plataforma': 2,
      'cc-card-organizacion': 3,
      'cc-card-sistema':    4,
      'cc-card-soporte':    5
    };
    const idx = orderMap[_cardSelector];
    if(idx === undefined) return;
    const cards = document.querySelectorAll('.cc-grid .cc-card');
    const card = cards[idx];
    if(!card) return;
    const barsEl = card.querySelector('.mini-bars');
    if(!barsEl) return;
    const max = Math.max(1, ...safe);
    barsEl.dataset.bars = safe.join(',');
    barsEl.innerHTML = safe.map(v => `<div class="mini-bar" style="height:${Math.max(5,(v/max)*100)}%"></div>`).join('');
  }

  // ══════════════════════════════════════════
  // FEED GLOBAL
  // ══════════════════════════════════════════
  async function refreshFeed(){
    const panel = document.getElementById('feed-panel');
    const meta = document.getElementById('feed-meta');
    if(!panel) return;

    try {
      const feed = await Cache.get('v_global_activity_feed', () =>
        global.sbGet('v_global_activity_feed', 'select=*&limit=15').catch(()=>[])
      );

      if(!feed || feed.length === 0){
        if(meta) meta.textContent = 'sin actividad reciente';
        return;
      }

      if(meta) meta.textContent = `${feed.length} eventos · últimos 7 días`;

      const iconMap = {
        'leads':        { icon: '+', cls: 'ok' },
        'appointments': { icon: '●', cls: 'ok' },
        'billing':      { icon: '$', cls: 'ok' },
        'clients':      { icon: '★', cls: 'ok' },
        'support':      { icon: '?', cls: 'err' }
      };

      panel.innerHTML = feed.map(f => {
        const ico = iconMap[f.category] || { icon: '·', cls: '' };
        const tag = (f.category || 'evento').toUpperCase();
        return `
          <div class="feed-row">
            <div class="feed-icon ${ico.cls}">${ico.icon}</div>
            <div class="feed-body"><strong>${escapeHtml(f.client_label || '')}</strong> · ${escapeHtml(f.description || '')}<span class="feed-tag">${escapeHtml(tag)}</span></div>
            <div class="feed-time">${timeAgo(f.ts)}</div>
          </div>`;
      }).join('');
    } catch(err){
      console.warn('[polish] refreshFeed:', err);
    }
  }

  // ══════════════════════════════════════════
  // CLIENTES LIST POLISH
  // ══════════════════════════════════════════
  const ClientsList = {
    _clients: [],
    _page: 0,
    _pageSize: 25,

    async load(){
      try {
        this._clients = await Cache.get('v_clients_full', () =>
          global.sbGet('v_clients_full', 'select=*&order=created_at.desc&limit=500').catch(()=>[])
        );
        this.render();
      } catch(err){
        console.warn('[polish] ClientsList.load:', err);
      }
    },

    render(){
      const el = document.getElementById('cl-list');
      if(!el) return;

      const total = this._clients.length;
      if(total === 0){
        el.innerHTML = `<div class="feed-row"><div class="feed-icon">·</div><div class="feed-body dim">No hay clientes en Supabase aún.</div></div>`;
        return;
      }

      // Paginación
      const pages = Math.ceil(total / this._pageSize);
      if(this._page >= pages) this._page = 0;
      const start = this._page * this._pageSize;
      const end = Math.min(start + this._pageSize, total);
      const rows = this._clients.slice(start, end);

      const moneda = (c) => c.moneda || '$';
      const fmt = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en');

      const header = `
        <div class="client-row" style="font-size:9px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;padding-top:12px;padding-bottom:8px;">
          <div>CLIENTE</div>
          <div>ACTIVIDAD 7D</div>
          <div>LEADS 30D</div>
          <div>REV 30D</div>
          <div>PLAN</div>
          <div>CITAS</div>
          <div>ESTADO</div>
        </div>
      `;

      const body = rows.map(c => {
        const name = c.empresa || c.nombre || 'Sin nombre';
        const initial = name[0]?.toUpperCase() || '?';
        const bars = Array.isArray(c.activity_by_day) ? c.activity_by_day : [0,0,0,0,0,0,0];
        const maxBar = Math.max(1, ...bars);
        const heatBars = bars.map(v => {
          const h = Math.max(10, (Number(v)/maxBar)*100);
          const active = Number(v) > 0;
          return `<div class="heat-bar ${active ? 'active' : ''}" style="height:${h}%;${active ? '' : 'opacity:0.3;'}"></div>`;
        }).join('');
        const statusChip = c.client_status === 'activo'
          ? '<span class="chip chip-live"><span class="chip-dot"></span>LIVE</span>'
          : c.client_status === 'churned'
            ? '<span class="chip chip-err">CHURNED</span>'
            : c.client_status === 'trial'
              ? '<span class="chip chip-warn">TRIAL</span>'
              : '<span class="chip chip-off">' + (c.client_status || '—').toUpperCase() + '</span>';
        return `
          <div class="client-row" onclick="window.openClienteDetail && openClienteDetail('${escapeHtml(c.id || c.email || '')}')" style="cursor:pointer;">
            <div class="client-name">
              <div class="client-avatar">${escapeHtml(initial)}</div>
              <div>
                <div style="font-weight:500;">${escapeHtml(name)}${c.wa_status === 'connected' ? ' <span class="live-dot"></span>' : ''}</div>
                <div class="dim" style="font-size:10px;">${escapeHtml(c.pais||'')} · ${escapeHtml(c.plan||'—')}</div>
              </div>
            </div>
            <div class="heat-bars" title="Últimos 7 días · ${bars.join(', ')}">${heatBars}</div>
            <div class="num">${c.total_leads_30d || 0}</div>
            <div class="num ${c.revenue_30d > 0 ? 'ok' : 'dim'}">${fmt(c.revenue_30d)}</div>
            <div class="dim">${(c.plan||'—').toUpperCase()}</div>
            <div class="num">${c.citas_confirmadas || 0}</div>
            <div>${statusChip}</div>
          </div>
        `;
      }).join('');

      const footer = pages > 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid var(--border);">
          <div class="dim" style="font-size:11px;">Mostrando ${start+1}-${end} de ${total}</div>
          <div style="display:flex;gap:6px;">
            <button class="btn ghost" ${this._page === 0 ? 'disabled' : ''} onclick="window.MadreClientsList.prevPage()">←</button>
            <span style="padding:6px 10px;font-size:11px;color:var(--text2);">Página ${this._page + 1} de ${pages}</span>
            <button class="btn ghost" ${this._page >= pages - 1 ? 'disabled' : ''} onclick="window.MadreClientsList.nextPage()">→</button>
          </div>
        </div>
      ` : '';

      el.innerHTML = header + body + footer;

      // Update count badge
      const count = document.getElementById('cl-count');
      if(count) count.textContent = `${total} clientes`;
    },

    prevPage(){ if(this._page > 0){ this._page--; this.render(); } },
    nextPage(){
      const pages = Math.ceil(this._clients.length / this._pageSize);
      if(this._page < pages - 1){ this._page++; this.render(); }
    }
  };
  global.MadreClientsList = ClientsList;

  // ══════════════════════════════════════════
  // REALTIME SUBSCRIPTIONS
  // ══════════════════════════════════════════
  const Realtime = {
    _channels: [],
    _initialized: false,

    init(){
      if(this._initialized) return;
      // v1.0.3 — try/catch wrapper · si Supabase SDK no carga o fallan suscripciones,
      // la app sigue funcional sin realtime (degradación controlada en lugar de crash).
      try {
        const supabaseUrl = global.SUPABASE_URL;
        const supabaseAnon = global.SUPABASE_ANON;
        const token = (global.SESSION?.accessToken) || supabaseAnon;
        if(!supabaseUrl || !global.supabase) {
          console.warn('[polish] Supabase SDK no disponible · realtime deshabilitado');
          return;
        }

        // Mini-sprint madre 2026-04-23: eventsPerSecond 5 → 100 + heartbeat + reconnect
        // exponencial. Antes se perdían eventos en picos; ahora mismo throughput que
        // dominio-client-app post Sprint 1B.
        const sb = global.supabase.createClient(supabaseUrl, supabaseAnon, {
          realtime: {
            params: { eventsPerSecond: 100 },
            heartbeatIntervalMs: 30000,
            reconnectAfterMs: (tries) => Math.min(1000 * Math.pow(2, Math.min(tries, 6)), 30000),
            timeout: 20000,
          },
          global: { headers: { Authorization: `Bearer ${token}` } }
        });
        if(token !== supabaseAnon) sb.realtime.setAuth(token);

        // Canal: invoices (refresh billing)
        // v1.0.3 — console.log de "✓ RT: x" eliminados (spam en DevTools)
        const ch1 = sb.channel('madre-invoices')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => this._onBillingChange())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions' }, () => this._onBillingChange())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, (p) => {
            global.toast?.('💰 Pago registrado', 'success');
            this._onBillingChange();
          })
          .subscribe();
        this._channels.push(ch1);

        // Canal: tickets
        const ch2 = sb.channel('madre-tickets')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (p) => {
            global.toast?.('📋 Nuevo ticket: ' + (p.new?.subject || ''), 'warn');
            this._onTicketChange();
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, () => this._onTicketChange())
          .subscribe();
        this._channels.push(ch2);

        // Canal: notifications (para toast)
        const ch3 = sb.channel('madre-notifications')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (p) => {
            const n = p.new;
            if(!n) return;
            const severityMap = { info: 'success', warn: 'warn', err: 'err', success: 'success' };
            global.toast?.(n.title || 'Notificación', severityMap[n.severity] || 'success');
          })
          .subscribe();
        this._channels.push(ch3);

        // Canal: leads + appointments + clients (command center)
        const ch4 = sb.channel('madre-pulse')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => this._onCommandChange())
          .on('postgres_changes', { event: '*',     schema: 'public', table: 'appointments' }, () => this._onCommandChange())
          .on('postgres_changes', { event: '*',     schema: 'public', table: 'clients' }, () => this._onCommandChange())
          .subscribe();
        this._channels.push(ch4);

        this._initialized = true;
        this._sb = sb;
      } catch(err) {
        console.warn('[polish] Realtime.init falló:', err.message || err);
        // App sigue funcional sin realtime · solo afecta updates en vivo
      }
    },

    _onBillingChange(){
      Cache.invalidate('v_mrr_live');
      Cache.invalidate('v_command_center');
      Cache.invalidate('v_global_activity_feed');
      if(global.currentView === 'invoices') global.InvoicesView?.load?.();
      if(global.currentView === 'subs')     global.SubsView?.load?.();
      if(global.currentView === 'dunning')  global.DunningView?.load?.();
      if(global.currentView === 'revenue')  global.loadRevenueReal?.();
      if(global.currentView === 'command')  loadCommandCenterReal();
    },
    _onTicketChange(){
      Cache.invalidate('v_command_center');
      if(global.currentView === 'tickets') global.TicketsView?.load?.();
      if(global.currentView === 'command') loadCommandCenterReal();
    },
    _onCommandChange(){
      Cache.invalidate('v_command_center');
      Cache.invalidate('v_kpi_sparkline');
      Cache.invalidate('v_global_activity_feed');
      Cache.invalidate('v_clients_full');
      if(global.currentView === 'command') {
        // Throttle: no dispares más de una vez cada 3s
        clearTimeout(this._t);
        this._t = setTimeout(() => loadCommandCenterReal(), 3000);
      }
      if(global.currentView === 'clients') ClientsList.load();
    },

    disconnect(){
      if(this._sb){
        this._channels.forEach(c => this._sb.removeChannel(c));
      }
      this._channels = [];
      this._initialized = false;
    }
  };
  global.MadreRealtime = Realtime;

  // ══════════════════════════════════════════
  // BOOT HOOK
  // ══════════════════════════════════════════
  // Se llama desde dashboard-madre.html después de loadSession + RBAC
  global.initMadrePolish = async function(){
    // Cargar Supabase SDK si no existe (necesario para Realtime)
    if(!global.supabase){
      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    }

    // Bootstrap: cargar command center con data real
    await loadCommandCenterReal();

    // Lista de clientes con heat-bars
    await ClientsList.load();

    // Refrescar cada 60s
    setInterval(() => {
      Cache.invalidate();
      if(global.currentView === 'command') loadCommandCenterReal();
      if(global.currentView === 'clients') ClientsList.load();
    }, 60000);

    // Activar realtime
    Realtime.init();
  };

  global.loadCommandCenterReal = loadCommandCenterReal;

  // ══════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════
  // escapeHtml viene de utils.js (window.escapeHtml)
  // timeAgo es local: usa 'ahora' para <60s, sin 'hace' en m/h/d (formato compacto)
  function timeAgo(iso){
    if(!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
    if(s < 60) return 'ahora';
    if(s < 3600) return Math.floor(s/60) + 'm';
    if(s < 86400) return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  }

})(window);
