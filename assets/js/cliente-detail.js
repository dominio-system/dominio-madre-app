// ============================================
// Dominio Madre · Cliente Detail Modal (v1.0.26 · Enterprise drill-down)
// ============================================
// Click en cualquier cliente → modal grande con KPIs ejecutivos + tabs:
//   · KPIs (header): MRR, Revenue 30d, Leads 30d, Citas 30d, Tickets abiertos
//   · Churn risk chip
//   · Tab Resumen (kpis + ultima actividad)
//   · Tab Citas (últimas 30)
//   · Tab Leads (últimas 30)
//   · Tab Facturas (últimas 30)
//   · Tab Tickets (todos)
//   · Tab Suscripción (active sub + history)
//
// Lee de v_client_summary (1 row con todos los KPIs pre-agregados).
// Tabs cargan on-demand para no bloquear el render inicial.
//
// Uso desde otras vistas:
//   window.openClienteDetail(clientIdOrEmail)
// ============================================

(function(global){
  'use strict';

  const escapeHtml = global.escapeHtml || ((s) => s);
  const fmtCents = (cents) => '$' + Math.round((Number(cents)||0) / 100).toLocaleString('en');
  const fmtMoney = (n) => '$' + Math.round(Number(n)||0).toLocaleString('en');
  const relTime = (iso) => {
    if(!iso) return '—';
    const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
    if(s < 60) return 'ahora';
    if(s < 3600) return Math.floor(s/60) + 'm';
    if(s < 86400) return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  };

  const ClienteDetail = {
    _wrap: null,
    _summary: null,
    _activeTab: 'resumen',
    _tabsCache: new Map(), // tab → data[]

    async open(clientIdOrEmail){
      // Build modal shell
      this._tabsCache.clear();
      this._activeTab = 'resumen';
      const wrap = document.createElement('div');
      wrap.className = 'cdetail-overlay';
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:980px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
          <div id="cd-header" style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
            <div style="font-size:13px;font-weight:600;flex:1;" id="cd-title">Cargando…</div>
            <button id="cd-close" style="width:30px;height:30px;background:transparent;border:0;color:var(--text3);cursor:pointer;font-size:16px;">✕</button>
          </div>
          <div id="cd-body" style="flex:1;overflow-y:auto;padding:0;"></div>
        </div>`;
      document.body.appendChild(wrap);
      this._wrap = wrap;
      const close = () => { wrap.remove(); this._wrap = null; };
      wrap.querySelector('#cd-close').onclick = close;
      wrap.addEventListener('click', (e) => { if(e.target === wrap) close(); });
      document.addEventListener('keydown', this._escHandler = (e) => { if(e.key === 'Escape') close(); }, { once: true });

      // Cargar summary
      try {
        // PostgREST: si parece UUID, query por id; si tiene @, query por email
        const isUuid = /^[0-9a-f-]{36}$/i.test(clientIdOrEmail);
        const param = isUuid ? `client_id=eq.${clientIdOrEmail}` : `email=eq.${encodeURIComponent(clientIdOrEmail)}`;
        const rows = await global.sbGet('v_client_summary', `select=*&${param}&limit=1`);
        if(!rows || rows.length === 0){
          wrap.querySelector('#cd-body').innerHTML = `<div style="padding:40px;text-align:center;color:var(--text3);">Cliente no encontrado.</div>`;
          return;
        }
        this._summary = rows[0];
        this.renderShell();
        this.loadTab('resumen'); // tab default
      } catch(err){
        wrap.querySelector('#cd-body').innerHTML = `<div style="padding:40px;text-align:center;color:var(--danger);">Error: ${escapeHtml(err.message || err)}</div>`;
      }
    },

    renderShell(){
      const s = this._summary;
      const empresa = s.empresa || s.nombre || 'Sin nombre';
      const initial = (empresa[0] || '?').toUpperCase();

      const churnColor = ({
        churned:        'var(--danger)',
        trial_ending:   'var(--warn)',
        at_risk_inactive: 'var(--warn)',
        at_risk_billing:  'var(--danger)',
        healthy:        'var(--success)',
      })[s.churn_risk] || 'var(--text3)';
      const churnLabel = ({
        churned:        'CHURNED',
        trial_ending:   'TRIAL · POR EXPIRAR',
        at_risk_inactive: 'INACTIVO 14D+',
        at_risk_billing:  'IMPAGO',
        healthy:        'HEALTHY',
      })[s.churn_risk] || s.churn_risk?.toUpperCase();

      const planChip = `<span class="chip chip-${s.client_status === 'activo' ? 'live' : s.client_status === 'churned' ? 'err' : 'warn'}" style="font-size:10px;">${escapeHtml((s.plan||'—').toUpperCase())} · ${escapeHtml((s.client_status||'').toUpperCase())}</span>`;

      // Header
      this._wrap.querySelector('#cd-title').innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:8px;background:var(--card3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${escapeHtml(initial)}</div>
          <div>
            <div style="font-size:14px;font-weight:600;">${escapeHtml(empresa)}</div>
            <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">${escapeHtml(s.email || '')} · ${escapeHtml(s.pais || '—')} · ${escapeHtml(s.industria || '—')}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center;">
            ${planChip}
            <span class="chip" style="font-size:10px;background:transparent;border:1px solid ${churnColor};color:${churnColor};">${churnLabel}</span>
          </div>
        </div>
      `;

      // Body con KPI strip + tabs
      this._wrap.querySelector('#cd-body').innerHTML = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
          <div class="kpi-card"><div class="kpi-label">MRR</div><div class="kpi-value">${fmtCents(s.mrr_cents)}</div><div class="kpi-trend">activo</div></div>
          <div class="kpi-card"><div class="kpi-label">REVENUE 30D</div><div class="kpi-value">${fmtCents(s.revenue_30d_cents)}</div><div class="kpi-trend up">cobrado</div></div>
          <div class="kpi-card"><div class="kpi-label">LEADS 30D</div><div class="kpi-value">${s.leads_30d || 0}</div><div class="kpi-trend">${s.leads_converted_30d || 0} convertidos</div></div>
          <div class="kpi-card"><div class="kpi-label">CITAS 30D</div><div class="kpi-value">${s.appointments_30d || 0}</div><div class="kpi-trend">${s.appointments_paid_30d || 0} pagadas</div></div>
          <div class="kpi-card"><div class="kpi-label">TICKETS</div><div class="kpi-value" style="color:${(s.tickets_open||0)>0?'var(--warn)':'var(--text)'};">${s.tickets_open || 0}</div><div class="kpi-trend">abiertos</div></div>
          <div class="kpi-card"><div class="kpi-label">WHATSAPP 30D</div><div class="kpi-value">${s.wa_messages_30d || 0}</div><div class="kpi-trend">msgs · ${s.wa_status || 'off'}</div></div>
        </div>
        <div style="padding:8px 18px 0;border-bottom:1px solid var(--border);display:flex;gap:4px;flex-wrap:wrap;" id="cd-tabs">
          ${[
            ['resumen','Resumen'],
            ['citas','Citas'],
            ['leads','Leads'],
            ['facturas','Facturas'],
            ['tickets','Tickets'],
            ['suscripcion','Suscripción'],
          ].map(([k,v]) => `<button class="cd-tab" data-cd-tab="${k}" style="padding:8px 14px;border:0;background:transparent;color:var(--text2);cursor:pointer;font-size:12px;font-family:inherit;border-bottom:2px solid transparent;">${v}</button>`).join('')}
        </div>
        <div id="cd-tab-content" style="padding:14px 18px;min-height:200px;">
          <div class="dim" style="text-align:center;padding:40px;font-size:12px;">Cargando…</div>
        </div>
      `;
      // Tab handlers
      this._wrap.querySelectorAll('.cd-tab').forEach(btn => {
        btn.onclick = () => this.loadTab(btn.dataset.cdTab);
      });
      this._highlightTab('resumen');
    },

    _highlightTab(tabKey){
      this._wrap.querySelectorAll('.cd-tab').forEach(t => {
        const active = t.dataset.cdTab === tabKey;
        t.style.color = active ? 'var(--text)' : 'var(--text3)';
        t.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
        t.style.fontWeight = active ? '600' : '400';
      });
    },

    async loadTab(tabKey){
      this._activeTab = tabKey;
      this._highlightTab(tabKey);
      const content = this._wrap.querySelector('#cd-tab-content');
      content.innerHTML = `<div class="dim" style="text-align:center;padding:40px;font-size:12px;">Cargando…</div>`;

      const cid = this._summary.client_id;
      try {
        if(tabKey === 'resumen'){
          this._renderResumen();
        } else if(tabKey === 'citas'){
          const rows = this._tabsCache.get('citas') || await global.sbGet('appointments', `client_id=eq.${cid}&select=*&order=fecha.desc&limit=30`);
          this._tabsCache.set('citas', rows);
          this._renderCitas(rows);
        } else if(tabKey === 'leads'){
          const rows = this._tabsCache.get('leads') || await global.sbGet('leads', `client_id=eq.${cid}&select=*&order=created_at.desc&limit=30`);
          this._tabsCache.set('leads', rows);
          this._renderLeads(rows);
        } else if(tabKey === 'facturas'){
          const rows = this._tabsCache.get('facturas') || await global.sbGet('invoices', `client_id=eq.${cid}&select=*&order=created_at.desc&limit=30`);
          this._tabsCache.set('facturas', rows);
          this._renderFacturas(rows);
        } else if(tabKey === 'tickets'){
          const rows = this._tabsCache.get('tickets') || await global.sbGet('tickets', `client_id=eq.${cid}&select=*&order=created_at.desc&limit=50`);
          this._tabsCache.set('tickets', rows);
          this._renderTickets(rows);
        } else if(tabKey === 'suscripcion'){
          const rows = this._tabsCache.get('suscripcion') || await global.sbGet('subscriptions', `client_id=eq.${cid}&select=*&order=created_at.desc&limit=10`);
          this._tabsCache.set('suscripcion', rows);
          this._renderSuscripcion(rows);
        }
      } catch(err){
        content.innerHTML = `<div style="color:var(--danger);text-align:center;padding:40px;">Error: ${escapeHtml(err.message || err)}</div>`;
      }
    },

    _renderResumen(){
      const s = this._summary;
      const content = this._wrap.querySelector('#cd-tab-content');
      const dt = (iso) => iso ? new Date(iso).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      content.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
          <div class="panel" style="padding:14px;">
            <div class="panel-title" style="font-size:11px;font-family:'Geist Mono',monospace;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">Cuenta</div>
            ${[
              ['Empresa', s.empresa],
              ['Nombre contacto', s.nombre],
              ['Email', s.email],
              ['WhatsApp', s.whatsapp || '—'],
              ['País', s.pais || '—'],
              ['Industria', s.industria || '—'],
              ['Vertical', s.vertical || '—'],
              ['Plan', (s.plan||'—').toUpperCase()],
              ['Status', (s.client_status||'—').toUpperCase()],
              ['Moneda', (s.moneda||'—').toUpperCase()],
              ['Trial expira', dt(s.trial_ends_at)],
            ].map(([k,v]) => `<div style="display:flex;padding:5px 0;border-bottom:1px dashed var(--border);font-size:12px;"><div class="dim" style="flex:0 0 130px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(k)}</div><div style="flex:1;">${escapeHtml(v||'—')}</div></div>`).join('')}
          </div>
          <div class="panel" style="padding:14px;">
            <div class="panel-title" style="font-size:11px;font-family:'Geist Mono',monospace;letter-spacing:1px;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">Última actividad</div>
            ${[
              ['Creado', dt(s.created_at)],
              ['Activado', dt(s.activated_at)],
              ['Última cita', dt(s.last_appointment_at)],
              ['Último lead', dt(s.last_lead_at)],
              ['Churned', dt(s.churned_at)],
              ['Churn risk', s.churn_risk],
              ['MRR', fmtCents(s.mrr_cents)],
              ['Revenue 30d', fmtCents(s.revenue_30d_cents)],
              ['Leads 30d', s.leads_30d || 0],
              ['Citas 30d', s.appointments_30d || 0],
              ['Tickets abiertos', s.tickets_open || 0],
            ].map(([k,v]) => `<div style="display:flex;padding:5px 0;border-bottom:1px dashed var(--border);font-size:12px;"><div class="dim" style="flex:0 0 130px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(k)}</div><div style="flex:1;">${escapeHtml(v||'—')}</div></div>`).join('')}
          </div>
        </div>
      `;
    },

    _renderCitas(rows){
      this._renderTable(rows, ['Fecha','Hora','Cliente','Servicio','Estado','Pagado','Precio'], (a) => `
        <tr>
          <td>${a.fecha || '—'}</td>
          <td>${a.hora || '—'}</td>
          <td><strong>${escapeHtml(a.nombre || a.whatsapp || '—')}</strong></td>
          <td>${escapeHtml(a.servicio || '—')}</td>
          <td><span class="chip ${a.estado === 'completed' ? 'chip-ok' : a.estado === 'canceled' ? 'chip-err' : 'chip-warn'}" style="font-size:9px;">${escapeHtml((a.estado||'?').toUpperCase())}</span></td>
          <td>${a.pagado ? '✓' : '—'}</td>
          <td class="num">${a.precio_cents ? fmtCents(a.precio_cents) : '—'}</td>
        </tr>`);
    },

    _renderLeads(rows){
      this._renderTable(rows, ['Nombre','WhatsApp','Status','Fuente','Intent','Creado'], (l) => `
        <tr>
          <td><strong>${escapeHtml(l.nombre || '—')}</strong></td>
          <td class="dim" style="font-family:monospace;">${escapeHtml(l.whatsapp || '—')}</td>
          <td><span class="chip ${l.status === 'cliente' ? 'chip-ok' : l.status === 'perdido' ? 'chip-err' : 'chip-warn'}" style="font-size:9px;">${escapeHtml((l.status||'?').toUpperCase())}</span></td>
          <td>${escapeHtml(l.utm_source || l.fuente || '—')}</td>
          <td class="num">${l.intent_score || '—'}</td>
          <td class="dim">${relTime(l.created_at)}</td>
        </tr>`);
    },

    _renderFacturas(rows){
      this._renderTable(rows, ['Número','Monto','Pagado','Status','Emitida','Vence'], (i) => {
        const cur = (i.currency||'usd').toUpperCase();
        return `
        <tr>
          <td><strong>${escapeHtml(i.number || i.id.slice(0,8))}</strong></td>
          <td class="num">${cur} ${(i.amount_due_cents/100).toLocaleString('en',{minimumFractionDigits:2})}</td>
          <td class="num ${i.amount_paid_cents >= i.amount_due_cents ? 'ok' : 'dim'}">${cur} ${((i.amount_paid_cents||0)/100).toLocaleString('en',{minimumFractionDigits:2})}</td>
          <td><span class="chip ${i.status === 'paid' ? 'chip-ok' : i.status === 'overdue' ? 'chip-err' : 'chip-warn'}" style="font-size:9px;">${escapeHtml((i.status||'?').toUpperCase())}</span></td>
          <td class="dim">${relTime(i.created_at)}</td>
          <td class="dim">${i.due_date ? relTime(i.due_date) : '—'}</td>
        </tr>`;
      });
    },

    _renderTickets(rows){
      this._renderTable(rows, ['Asunto','Prioridad','Status','SLA','Creado'], (t) => `
        <tr>
          <td><strong>${escapeHtml(t.subject || '—')}</strong></td>
          <td>${escapeHtml((t.priority||'normal').toUpperCase())}</td>
          <td><span class="chip ${t.status === 'resolved' || t.status === 'closed' ? 'chip-ok' : 'chip-warn'}" style="font-size:9px;">${escapeHtml((t.status||'?').toUpperCase())}</span></td>
          <td class="dim">${t.sla_deadline ? relTime(t.sla_deadline) : '—'}</td>
          <td class="dim">${relTime(t.created_at)}</td>
        </tr>`);
    },

    _renderSuscripcion(rows){
      this._renderTable(rows, ['Plan','Monto','Intervalo','Status','Próximo cobro','Inicio'], (s) => {
        const cur = (s.currency||'usd').toUpperCase();
        return `
        <tr>
          <td><strong>${escapeHtml(s.plan_label || s.plan || '—')}</strong></td>
          <td class="num">${cur} ${((s.amount_cents||0)/100).toLocaleString('en',{minimumFractionDigits:2})}</td>
          <td>${s.interval || 'month'}</td>
          <td><span class="chip ${s.status === 'active' ? 'chip-ok' : s.status === 'past_due' ? 'chip-err' : 'chip-warn'}" style="font-size:9px;">${escapeHtml((s.status||'?').toUpperCase())}</span></td>
          <td class="dim">${s.current_period_end ? relTime(s.current_period_end) : '—'}</td>
          <td class="dim">${relTime(s.created_at)}</td>
        </tr>`;
      });
    },

    _renderTable(rows, headers, rowFn){
      const content = this._wrap.querySelector('#cd-tab-content');
      if(!rows || rows.length === 0){
        content.innerHTML = `<div class="dim" style="text-align:center;padding:40px;font-size:12px;">Sin registros para este cliente.</div>`;
        return;
      }
      content.innerHTML = `
        <table class="tbl" style="width:100%;font-size:12px;">
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(rowFn).join('')}</tbody>
        </table>
        <div class="dim" style="text-align:right;font-size:10px;font-family:'Geist Mono',monospace;margin-top:10px;">${rows.length} registros</div>
      `;
    },
  };

  global.ClienteDetail = ClienteDetail;
  // Compat con MadreClientsList que ya llama a window.openClienteDetail
  global.openClienteDetail = (idOrEmail) => ClienteDetail.open(idOrEmail);
})(window);
