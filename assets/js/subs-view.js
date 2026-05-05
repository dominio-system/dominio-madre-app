// ============================================
// Dominio Madre · Vista Subscriptions (Fase 2)
// ============================================
(function(global){
  'use strict';

  const SubsView = {
    _subs: [],
    _clients: [],
    _filter: { status: 'all' },

    async render(){
      const view = document.querySelector('.view[data-view="subs"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Subscriptions</div><div class="page-sub" id="sv-sub">NEGOCIO · CARGANDO…</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="sv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="sv-new">+ Nueva suscripción</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">ACTIVAS</div><div class="kpi-value" id="sv-active">—</div><div class="kpi-trend up">facturando</div></div>
          <div class="kpi-card"><div class="kpi-label">TRIAL</div><div class="kpi-value" id="sv-trial">—</div><div class="kpi-trend">período prueba</div></div>
          <div class="kpi-card"><div class="kpi-label">PAST DUE</div><div class="kpi-value" id="sv-past" style="color:var(--warn);">—</div><div class="kpi-trend">con factura vencida</div></div>
          <div class="kpi-card"><div class="kpi-label">MRR</div><div class="kpi-value" id="sv-mrr">—</div><div class="kpi-trend up">real</div></div>
        </div>

        <div class="panel" style="margin-bottom:12px;">
          <div class="panel-head"><div class="panel-title">Filtros</div><div class="panel-sub" id="sv-count">—</div></div>
          <div style="display:flex;gap:2px;background:var(--card2);border:1px solid var(--border);border-radius:5px;padding:2px;margin:12px 14px;width:fit-content;">
            <button data-sf="all"      class="period-tab active" onclick="SubsView.setFilter('all')">Todas</button>
            <button data-sf="active"   class="period-tab" onclick="SubsView.setFilter('active')">Activas</button>
            <button data-sf="trialing" class="period-tab" onclick="SubsView.setFilter('trialing')">Trial</button>
            <button data-sf="past_due" class="period-tab" onclick="SubsView.setFilter('past_due')">Past Due</button>
            <button data-sf="paused"   class="period-tab" onclick="SubsView.setFilter('paused')">Paused</button>
            <button data-sf="canceled" class="period-tab" onclick="SubsView.setFilter('canceled')">Canceladas</button>
          </div>
        </div>

        <div class="panel">
          <table class="tbl">
            <thead>
              <tr>
                <th class="sortable">Cliente</th><th class="sortable">Plan</th><th class="sortable">Monto</th><th class="sortable">Intervalo</th><th class="sortable">Status</th><th class="sortable">Próximo cobro</th><th class="sortable">Inicio</th><th style="text-align:right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="sv-tbody"><tr><td colspan="8" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('sv-refresh').onclick = () => this.load();
      document.getElementById('sv-new').onclick = () => this.openCreateModal();
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('sv-new'), 'billing:write');

      await this.load();
    },

    setFilter(status){
      this._filter.status = status;
      document.querySelectorAll('.period-tab[data-sf]').forEach(t => t.classList.toggle('active', t.dataset.sf === status));
      this.renderTable();
    },

    async load(){
      try {
        document.getElementById('sv-sub').textContent = 'NEGOCIO · CARGANDO…';
        const [subs, clients, mrrRows] = await Promise.all([
          global.sbGet('subscriptions', 'select=*,clients(empresa,nombre,email)&order=created_at.desc'),
          global.sbGet('clients', 'select=id,empresa,nombre&status=eq.activo&order=empresa'),
          global.sbGet('v_mrr_live', 'select=*').catch(()=>[])
        ]);
        this._subs = subs || [];
        this._clients = clients || [];
        const mrr = mrrRows?.[0] || {};

        this.renderKPIs(mrr);
        this.renderTable();
        document.getElementById('sv-sub').textContent = `NEGOCIO · ${this._subs.length} SUSCRIPCIONES`;
      } catch(err){
        document.getElementById('sv-sub').textContent = 'ERROR · ' + err.message;
        document.getElementById('sv-tbody').innerHTML = `<tr><td colspan="8" class="dim" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(err.message)}</td></tr>`;
      }
    },

    renderKPIs(mrr){
      document.getElementById('sv-active').textContent = mrr.active_subs ?? this._subs.filter(s => s.status === 'active').length;
      document.getElementById('sv-trial').textContent  = mrr.trialing_subs ?? this._subs.filter(s => s.status === 'trialing').length;
      document.getElementById('sv-past').textContent   = mrr.past_due_subs ?? this._subs.filter(s => s.status === 'past_due').length;
      document.getElementById('sv-mrr').textContent    = '$' + Math.round(mrr.mrr_total || 0).toLocaleString('en');
    },

    _filtered(){
      if(this._filter.status === 'all') return this._subs.slice();
      return this._subs.filter(s => s.status === this._filter.status);
    },

    renderTable(){
      const tbody = document.getElementById('sv-tbody');
      const rows = this._filtered();
      document.getElementById('sv-count').textContent = `${rows.length} de ${this._subs.length}`;

      if(rows.length === 0){
        tbody.innerHTML = `<tr><td colspan="8" style="padding:0;">${global.MadreUtils.emptyState({
          icon:'⟲', title:'Sin subscripciones todavía',
          body:'Cuando un cliente Pro active su plan, su subscripción aparecerá aquí.'
        })}</td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('billing:write');
      tbody.innerHTML = rows.map(s => {
        const client = s.clients?.empresa || s.clients?.nombre || '—';
        const cur = (s.currency||'usd').toUpperCase();
        const amount = s.amount_cents/100;
        const statusChip = {
          active:     '<span class="chip chip-ok"><span class="chip-dot"></span>ACTIVE</span>',
          trialing:   '<span class="chip chip-warn"><span class="chip-dot"></span>TRIAL</span>',
          past_due:   '<span class="chip chip-err"><span class="chip-dot"></span>PAST DUE</span>',
          paused:     '<span class="chip chip-off"><span class="chip-dot"></span>PAUSED</span>',
          canceled:   '<span class="chip chip-off">CANCELED</span>',
          unpaid:     '<span class="chip chip-err">UNPAID</span>',
          incomplete: '<span class="chip chip-warn">INCOMPLETE</span>'
        }[s.status] || `<span class="chip chip-off">${escapeHtml(s.status||'—')}</span>`;

        const actions = [];
        if(canWrite){
          if(s.status === 'active'){
            actions.push(`<button class="icon-btn" title="Pausar cobranza" onclick="SubsView.pauseCollection('${s.id}')">⏸</button>`);
            actions.push(`<button class="icon-btn" title="Generar factura ahora" onclick="SubsView.generateNow('${s.id}')">⚡</button>`);
            actions.push(`<button class="icon-btn" title="Cancelar" onclick="SubsView.cancel('${s.id}')" style="color:var(--danger);">✕</button>`);
          } else if(s.status === 'paused'){
            actions.push(`<button class="icon-btn" title="Reanudar" onclick="SubsView.resume('${s.id}')">▶</button>`);
          } else if(s.status === 'trialing'){
            actions.push(`<button class="icon-btn" title="Activar ahora" onclick="SubsView.activateNow('${s.id}')">▶</button>`);
            actions.push(`<button class="icon-btn" title="Cancelar" onclick="SubsView.cancel('${s.id}')" style="color:var(--danger);">✕</button>`);
          }
        }

        return `
          <tr>
            <td><strong>${escapeHtml(client)}</strong></td>
            <td>${escapeHtml(s.plan_label || s.plan)}</td>
            <td class="num"><strong>${cur} ${amount.toLocaleString('en',{minimumFractionDigits:2})}</strong></td>
            <td class="dim">${s.interval || 'month'}</td>
            <td>${statusChip}</td>
            <td class="num dim">${s.current_period_end ? new Date(s.current_period_end).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}</td>
            <td class="num dim">${new Date(s.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>
        `;
      }).join('');
    },

    openCreateModal(){
      if(!global.RBAC?.can('billing:write')){ global.toast?.('Sin permiso', 'err'); return; }
      const clientOpts = this._clients.map(c => `<option value="${c.id}">${escapeHtml(c.empresa || c.nombre)}</option>`).join('');
      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">Nueva suscripción</div>
          <button id="sc-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">CLIENTE</div>
            <select id="sc-client" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">${clientOpts}</select>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PLAN (slug)</div>
            <input id="sc-plan" type="text" placeholder="starter / pro / business" value="starter" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">LABEL</div>
            <input id="sc-label" type="text" placeholder="Starter" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;"></div>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MONTO</div>
            <input id="sc-amount" type="number" step="0.01" min="0" placeholder="99.00" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MONEDA</div>
            <select id="sc-currency" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="usd">USD</option><option value="mxn">MXN</option><option value="dop">DOP</option><option value="eur">EUR</option><option value="cop">COP</option>
            </select></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">INTERVALO</div>
            <select id="sc-interval" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="month">Mensual</option><option value="year">Anual</option>
            </select></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">TRIAL DAYS</div>
            <input id="sc-trial" type="number" min="0" value="0" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="sc-cancel">Cancelar</button>
          <button class="btn primary" id="sc-save">Crear suscripción</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:480px;">${body}</div>`;
      document.body.appendChild(wrap);
      const close = () => wrap.remove();
      wrap.querySelector('#sc-close').onclick = close;
      wrap.querySelector('#sc-cancel').onclick = close;
      wrap.querySelector('#sc-save').onclick = async () => {
        const clientId = wrap.querySelector('#sc-client').value;
        const plan = wrap.querySelector('#sc-plan').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
        const plan_label = wrap.querySelector('#sc-label').value.trim() || plan;
        const amount = parseFloat(wrap.querySelector('#sc-amount').value);
        const currency = wrap.querySelector('#sc-currency').value;
        const interval = wrap.querySelector('#sc-interval').value;
        const trial_days = parseInt(wrap.querySelector('#sc-trial').value) || 0;

        if(!clientId){ global.toast?.('Cliente requerido', 'err'); return; }
        if(!plan){ global.toast?.('Plan requerido', 'err'); return; }
        if(!amount || amount <= 0){ global.toast?.('Monto inválido', 'err'); return; }

        try {
          const sub = await global.Payments.createSubscription(clientId, {
            plan, amount_cents: Math.round(amount*100), interval, currency: currency.toLowerCase(), trial_days
          });
          // Agregar plan_label manualmente (payments.js base no lo incluye)
          if(sub?.id && plan_label !== plan){
            await global.sbPatch('subscriptions', sub.id, { plan_label });
          }
          close();
          global.toast?.('Suscripción creada', 'success');
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    async pauseCollection(id){
      try {
        await global.sbPatch('subscriptions', id, { pause_collection: true, status: 'paused' });
        global.toast?.('Cobranza pausada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },
    async resume(id){
      try {
        await global.sbPatch('subscriptions', id, { pause_collection: false, status: 'active' });
        global.toast?.('Reanudada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },
    async activateNow(id){
      try {
        await global.sbPatch('subscriptions', id, { status: 'active', trial_end: new Date().toISOString() });
        global.toast?.('Activada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },
    async cancel(id){
      const reason = prompt('Razón de cancelación (opcional):') || '';
      if(reason === null) return;
      try {
        await global.Payments.cancelSubscription(id, reason);
        global.toast?.('Suscripción cancelada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },
    async generateNow(id){
      if(!confirm('¿Generar invoice de renovación ahora?')) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/rest/v1/rpc/fn_generate_invoice_from_subscription`, {
          method: 'POST',
          headers: { ...global.sbHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_subscription_id: id })
        });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const invoiceId = await r.json();
        if(!invoiceId){ global.toast?.('Subscription no elegible', 'warn'); return; }
        global.toast?.('Invoice generada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.SubsView = SubsView;
})(window);
