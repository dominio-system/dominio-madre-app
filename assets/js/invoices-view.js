// ============================================
// Dominio Madre · Vista Invoices (Fase 2)
// ============================================
// CRUD de facturas con Payment Adapter (modo manual).
// Depende de: window.sbGet, sbInsert, sbPatch, Payments, RBAC, toast

(function(global){
  'use strict';

  const InvoicesView = {
    _invoices: [],
    _clients: [],
    _subscriptions: [],
    _filter: { status: 'all', clientId: '' },

    async render(){
      const view = document.querySelector('.view[data-view="invoices"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div>
            <div class="page-title">Invoices</div>
            <div class="page-sub" id="iv-sub">NEGOCIO · CARGANDO…</div>
          </div>
          <div class="page-actions">
            <button class="btn ghost" id="iv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="iv-new">+ Nueva factura</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">PAGADO 30D</div><div class="kpi-value" id="iv-paid30">—</div><div class="kpi-trend up">cobrado</div></div>
          <div class="kpi-card"><div class="kpi-label">PENDIENTE</div><div class="kpi-value" id="iv-open">—</div><div class="kpi-trend">por cobrar</div></div>
          <div class="kpi-card"><div class="kpi-label">OVERDUE</div><div class="kpi-value" id="iv-overdue" style="color:var(--danger);">—</div><div class="kpi-trend down">atrasadas</div></div>
          <div class="kpi-card"><div class="kpi-label">TICKET PROM.</div><div class="kpi-value" id="iv-avg">—</div><div class="kpi-trend">por factura</div></div>
        </div>

        <div class="panel" style="margin-bottom:12px;">
          <div class="panel-head">
            <div class="panel-title">Filtros</div>
            <div class="panel-sub" id="iv-count">—</div>
          </div>
          <div style="display:flex;gap:10px;padding:12px 14px;flex-wrap:wrap;align-items:center;">
            <div style="display:flex;gap:2px;background:var(--card2);border:1px solid var(--border);border-radius:5px;padding:2px;">
              <button data-f="all"     class="period-tab active" onclick="InvoicesView.setFilter('status','all')">Todas</button>
              <button data-f="draft"   class="period-tab" onclick="InvoicesView.setFilter('status','draft')">Draft</button>
              <button data-f="open"    class="period-tab" onclick="InvoicesView.setFilter('status','open')">Abiertas</button>
              <button data-f="overdue" class="period-tab" onclick="InvoicesView.setFilter('status','overdue')">Overdue</button>
              <button data-f="paid"    class="period-tab" onclick="InvoicesView.setFilter('status','paid')">Pagadas</button>
              <button data-f="void"    class="period-tab" onclick="InvoicesView.setFilter('status','void')">Void</button>
            </div>
            <select id="iv-client-filter" style="background:var(--card2);border:1px solid var(--border);color:var(--text);padding:5px 10px;border-radius:5px;font-size:11px;font-family:inherit;outline:none;min-width:180px;">
              <option value="">Todos los clientes</option>
            </select>
          </div>
        </div>

        <div class="panel">
          <table class="tbl">
            <thead>
              <tr>
                <th>Número</th>
                <th>Cliente</th>
                <th>Monto</th>
                <th>Pagado</th>
                <th>Status</th>
                <th>Emitida</th>
                <th>Vence</th>
                <th>Pagada</th>
                <th style="text-align:right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="iv-tbody"><tr><td colspan="9" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('iv-refresh').onclick = () => this.load();
      document.getElementById('iv-new').onclick = () => this.openCreateModal();
      document.getElementById('iv-client-filter').onchange = (e) => this.setFilter('clientId', e.target.value);

      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('iv-new'), 'billing:write');

      await this.load();
    },

    setFilter(key, value){
      this._filter[key] = value;
      // Actualizar UI tabs
      document.querySelectorAll('.period-tab[data-f]').forEach(t => t.classList.toggle('active', t.dataset.f === this._filter.status));
      this.renderTable();
    },

    async load(){
      try {
        document.getElementById('iv-sub').textContent = 'NEGOCIO · CARGANDO…';
        const [invoices, clients, subs] = await Promise.all([
          global.sbGet('invoices', 'select=*,clients(empresa,nombre,email)&order=created_at.desc&limit=200'),
          global.sbGet('clients', 'select=id,empresa,nombre&status=eq.activo&order=empresa'),
          global.sbGet('subscriptions', 'select=id,client_id,plan,plan_label,amount_cents,currency,status&status=eq.active')
        ]);
        this._invoices = invoices || [];
        this._clients = clients || [];
        this._subscriptions = subs || [];

        this.populateClientFilter();
        this.renderKPIs();
        this.renderTable();
        document.getElementById('iv-sub').textContent = `NEGOCIO · ${this._invoices.length} FACTURAS`;
      } catch(err) {
        console.error('[InvoicesView] load:', err);
        document.getElementById('iv-sub').textContent = 'ERROR · ' + err.message;
        document.getElementById('iv-tbody').innerHTML = `<tr><td colspan="9" class="dim" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(err.message)}</td></tr>`;
      }
    },

    populateClientFilter(){
      const sel = document.getElementById('iv-client-filter');
      sel.innerHTML = `<option value="">Todos los clientes</option>` +
        this._clients.map(c => `<option value="${c.id}">${escapeHtml(c.empresa || c.nombre || '—')}</option>`).join('');
    },

    renderKPIs(){
      const now = new Date();
      const d30 = new Date(now - 30 * 864e5);
      const paid30 = this._invoices.filter(i => i.status === 'paid' && i.paid_at && new Date(i.paid_at) >= d30);
      const open = this._invoices.filter(i => i.status === 'open');
      const overdue = this._invoices.filter(i => i.status === 'overdue');

      const paid30Total = paid30.reduce((s,i) => s + (i.amount_paid_cents || 0), 0) / 100;
      const openTotal = open.reduce((s,i) => s + (i.amount_due_cents - (i.amount_paid_cents||0)), 0) / 100;
      const overdueTotal = overdue.reduce((s,i) => s + (i.amount_due_cents - (i.amount_paid_cents||0)), 0) / 100;
      const avg = this._invoices.length ? this._invoices.reduce((s,i)=>s+i.amount_due_cents,0) / this._invoices.length / 100 : 0;

      document.getElementById('iv-paid30').textContent  = fmtMoney(paid30Total);
      document.getElementById('iv-open').textContent    = fmtMoney(openTotal);
      document.getElementById('iv-overdue').textContent = fmtMoney(overdueTotal);
      document.getElementById('iv-avg').textContent     = fmtMoney(avg);
    },

    _filtered(){
      let out = this._invoices.slice();
      if(this._filter.status !== 'all'){
        out = out.filter(i => i.status === this._filter.status);
      }
      if(this._filter.clientId){
        out = out.filter(i => i.client_id === this._filter.clientId);
      }
      return out;
    },

    renderTable(){
      const tbody = document.getElementById('iv-tbody');
      const rows = this._filtered();
      document.getElementById('iv-count').textContent = `${rows.length} de ${this._invoices.length}`;

      if(rows.length === 0){
        tbody.innerHTML = `<tr><td colspan="9" class="dim" style="text-align:center;padding:24px;">Sin facturas con estos filtros.</td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('billing:write');
      tbody.innerHTML = rows.map(i => {
        const client = i.clients?.empresa || i.clients?.nombre || '—';
        const amount = (i.amount_due_cents/100);
        const paid = (i.amount_paid_cents||0)/100;
        const cur = (i.currency || 'usd').toUpperCase();
        const statusChip = {
          draft:   '<span class="chip chip-off">DRAFT</span>',
          open:    '<span class="chip chip-warn"><span class="chip-dot"></span>OPEN</span>',
          paid:    '<span class="chip chip-ok"><span class="chip-dot"></span>PAID</span>',
          overdue: '<span class="chip chip-err"><span class="chip-dot"></span>OVERDUE</span>',
          void:    '<span class="chip chip-off">VOID</span>',
          uncollectible: '<span class="chip chip-err">INCOBRABLE</span>'
        }[i.status] || `<span class="chip chip-off">${escapeHtml(i.status||'—')}</span>`;

        const dunningBadge = i.dunning_state && i.dunning_state !== 'none' && i.status !== 'paid'
          ? `<div style="font-size:9px;font-family:'Geist Mono',monospace;color:var(--warn);margin-top:3px;">DUNNING: ${i.dunning_state.toUpperCase()}</div>`
          : '';

        const actions = [];
        if(canWrite){
          if(i.status === 'draft'){
            actions.push(`<button class="icon-btn" title="Publicar" onclick="InvoicesView.publish('${i.id}')">▶</button>`);
            actions.push(`<button class="icon-btn" title="Eliminar" onclick="InvoicesView.delete('${i.id}')" style="color:var(--danger);">✕</button>`);
          } else if(i.status === 'open' || i.status === 'overdue'){
            actions.push(`<button class="icon-btn" title="Marcar pagada" onclick="InvoicesView.openMarkPaid('${i.id}')" style="color:var(--success);">✓</button>`);
            actions.push(`<button class="icon-btn" title="Void" onclick="InvoicesView.void('${i.id}')">Ø</button>`);
          }
        }
        actions.push(`<button class="icon-btn" title="Detalles" onclick="InvoicesView.showDetails('${i.id}')">…</button>`);

        return `
          <tr>
            <td><strong>${escapeHtml(i.number || i.id.slice(0,8))}</strong><div class="dim" style="font-size:9px;font-family:'Geist Mono',monospace;">${escapeHtml((i.provider||'manual').toUpperCase())}</div></td>
            <td>${escapeHtml(client)}</td>
            <td class="num"><strong>${cur} ${amount.toLocaleString('en',{minimumFractionDigits:2})}</strong></td>
            <td class="num ${i.amount_paid_cents >= i.amount_due_cents ? 'ok' : 'dim'}">${cur} ${paid.toLocaleString('en',{minimumFractionDigits:2})}</td>
            <td>${statusChip}${dunningBadge}</td>
            <td class="num dim">${i.created_at ? new Date(i.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) : '—'}</td>
            <td class="num dim">${i.due_date ? new Date(i.due_date).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) : '—'}</td>
            <td class="num ${i.paid_at ? 'ok' : 'dim'}">${i.paid_at ? new Date(i.paid_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short'}) : '—'}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>
        `;
      }).join('');
    },

    // ── Crear invoice ──
    openCreateModal(){
      if(!global.RBAC?.can('billing:write')){ global.toast?.('Sin permiso', 'err'); return; }

      const clientOpts = this._clients.map(c => `<option value="${c.id}">${escapeHtml(c.empresa || c.nombre || '—')}</option>`).join('');

      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">Nueva factura manual</div>
          <button id="ic-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">CLIENTE</div>
            <select id="ic-client" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">${clientOpts}</select>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px;">
            <div>
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MONTO</div>
              <input id="ic-amount" type="number" step="0.01" min="0" placeholder="0.00" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;outline:none;">
            </div>
            <div>
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MONEDA</div>
              <select id="ic-currency" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
                <option value="usd">USD</option><option value="mxn">MXN</option><option value="dop">DOP</option><option value="eur">EUR</option><option value="cop">COP</option>
              </select>
            </div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">DESCRIPCIÓN</div>
            <input id="ic-desc" type="text" placeholder="Ej: Plan Starter · Abril 2026" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div>
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PERIODO INICIO</div>
              <input id="ic-period-start" type="date" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
            </div>
            <div>
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PERIODO FIN</div>
              <input id="ic-period-end" type="date" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
            </div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">VENCIMIENTO</div>
            <input id="ic-due-date" type="date" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
          </div>
          <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--card2);border-radius:5px;cursor:pointer;">
            <input id="ic-publish" type="checkbox" checked>
            <span style="font-size:12px;">Publicar inmediatamente (status=open)</span>
          </label>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="ic-cancel">Cancelar</button>
          <button class="btn primary" id="ic-save">Crear factura</button>
        </div>
      `;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">${body}</div>`;
      document.body.appendChild(wrap);

      // Defaults
      const today = new Date();
      const plus7 = new Date(today.getTime() + 7 * 864e5);
      const nextMonth = new Date(today.getFullYear(), today.getMonth()+1, today.getDate());
      wrap.querySelector('#ic-period-start').value = today.toISOString().slice(0,10);
      wrap.querySelector('#ic-period-end').value = nextMonth.toISOString().slice(0,10);
      wrap.querySelector('#ic-due-date').value = plus7.toISOString().slice(0,10);

      const close = () => wrap.remove();
      wrap.querySelector('#ic-close').onclick = close;
      wrap.querySelector('#ic-cancel').onclick = close;
      wrap.querySelector('#ic-save').onclick = async () => {
        const clientId = wrap.querySelector('#ic-client').value;
        const amount = parseFloat(wrap.querySelector('#ic-amount').value);
        const currency = wrap.querySelector('#ic-currency').value;
        const desc = wrap.querySelector('#ic-desc').value.trim();
        const psd = wrap.querySelector('#ic-period-start').value;
        const ped = wrap.querySelector('#ic-period-end').value;
        const dued = wrap.querySelector('#ic-due-date').value;
        const publish = wrap.querySelector('#ic-publish').checked;

        if(!clientId){ global.toast?.('Selecciona un cliente', 'err'); return; }
        if(!amount || amount <= 0){ global.toast?.('Monto inválido', 'err'); return; }

        try {
          // Generar número desde Postgres
          const numberResp = await global.sb ? null : null; // fallback: sin RPC usamos el default de la función
          let number = null;
          try {
            const r = await fetch(`${global.SUPABASE_URL}/rest/v1/rpc/fn_next_invoice_number`, {
              method: 'POST',
              headers: { ...global.sbHeaders(), 'Content-Type': 'application/json' },
              body: '{}'
            });
            if(r.ok) number = await r.json();
          } catch(e){ /* no-op */ }

          const inv = await global.Payments.createInvoice(clientId, {
            amount_cents: Math.round(amount * 100),
            currency: currency.toLowerCase(),
            description: desc || null,
            period_start: psd ? new Date(psd).toISOString() : null,
            period_end: ped ? new Date(ped).toISOString() : null,
            due_date: dued ? new Date(dued).toISOString() : null,
            number
          });
          // Si no se quiere publicar, cambiar a draft
          if(!publish && inv?.id){
            await global.sbPatch('invoices', inv.id, { status: 'draft' });
          }
          close();
          global.toast?.(`Factura ${inv?.number || ''} creada`, 'success');
          await this.load();
        } catch(err){
          console.error('[InvoicesView] create:', err);
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    // ── Publish / Void / Delete / Pay ──
    async publish(invoiceId){
      try {
        await global.sbPatch('invoices', invoiceId, { status: 'open' });
        global.toast?.('Factura publicada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async void(invoiceId){
      if(!confirm('¿Anular esta factura? No se puede revertir.')) return;
      try {
        await global.sbPatch('invoices', invoiceId, { status: 'void', voided_at: new Date().toISOString() });
        global.toast?.('Factura anulada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async delete(invoiceId){
      if(!confirm('¿Eliminar borrador?')) return;
      try {
        const res = await fetch(`${global.SUPABASE_URL}/rest/v1/invoices?id=eq.${invoiceId}`, { method: 'DELETE', headers: global.sbHeaders() });
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        global.toast?.('Borrador eliminado', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    openMarkPaid(invoiceId){
      const inv = this._invoices.find(i => i.id === invoiceId);
      if(!inv) return;

      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">Marcar como pagada</div>
          <button id="mp-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="padding:10px;background:var(--card2);border-radius:5px;margin-bottom:12px;font-size:12px;">
            <div><strong>${escapeHtml(inv.number || inv.id.slice(0,8))}</strong></div>
            <div class="dim">${(inv.currency||'usd').toUpperCase()} ${(inv.amount_due_cents/100).toLocaleString('en',{minimumFractionDigits:2})}</div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MÉTODO</div>
            <select id="mp-method" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="transferencia">Transferencia bancaria</option>
              <option value="paypal">PayPal</option>
              <option value="wise">Wise</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="zelle">Zelle</option>
              <option value="cashapp">Cash App</option>
              <option value="efectivo">Efectivo</option>
              <option value="other">Otro</option>
            </select>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">REFERENCIA (opcional)</div>
            <input id="mp-ref" type="text" placeholder="# transferencia, email PayPal, etc." style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;">
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">FECHA DE PAGO</div>
            <input id="mp-date" type="datetime-local" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="mp-cancel">Cancelar</button>
          <button class="btn primary" id="mp-save" style="background:var(--success);border-color:var(--success);color:#000;">Confirmar pago</button>
        </div>
      `;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:440px;">${body}</div>`;
      document.body.appendChild(wrap);
      wrap.querySelector('#mp-date').value = new Date().toISOString().slice(0,16);

      const close = () => wrap.remove();
      wrap.querySelector('#mp-close').onclick = close;
      wrap.querySelector('#mp-cancel').onclick = close;
      wrap.querySelector('#mp-save').onclick = async () => {
        const method = wrap.querySelector('#mp-method').value;
        const ref = wrap.querySelector('#mp-ref').value.trim();
        const dt = wrap.querySelector('#mp-date').value;
        try {
          await global.Payments.markInvoicePaid(invoiceId, {
            method,
            reference: ref || null,
            paidAt: dt ? new Date(dt).toISOString() : undefined
          });
          close();
          global.toast?.('✓ Pago registrado', 'success');
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    showDetails(invoiceId){
      const inv = this._invoices.find(i => i.id === invoiceId);
      if(!inv) return;
      const cur = (inv.currency||'usd').toUpperCase();
      const rows = [
        ['ID', inv.id],
        ['Número', inv.number],
        ['Status', inv.status],
        ['Dunning state', inv.dunning_state],
        ['Dunning attempts', inv.dunning_attempts],
        ['Próximo dunning', inv.next_dunning_at ? new Date(inv.next_dunning_at).toLocaleString() : '—'],
        ['Cliente', inv.clients?.empresa || inv.clients?.nombre || inv.client_id],
        ['Subscription', inv.subscription_id || '—'],
        ['Descripción', inv.description || '—'],
        ['Monto debido', `${cur} ${(inv.amount_due_cents/100).toLocaleString('en',{minimumFractionDigits:2})}`],
        ['Monto pagado', `${cur} ${((inv.amount_paid_cents||0)/100).toLocaleString('en',{minimumFractionDigits:2})}`],
        ['Comisión', `${cur} ${((inv.fee_cents||0)/100).toLocaleString('en',{minimumFractionDigits:2})}`],
        ['Periodo', `${inv.period_start ? new Date(inv.period_start).toLocaleDateString() : '—'} → ${inv.period_end ? new Date(inv.period_end).toLocaleDateString() : '—'}`],
        ['Vence', inv.due_date ? new Date(inv.due_date).toLocaleString() : '—'],
        ['Pagada', inv.paid_at ? new Date(inv.paid_at).toLocaleString() : '—'],
        ['Método pago', inv.payment_method || '—'],
        ['Referencia', inv.payment_reference || '—'],
        ['Provider', inv.provider || '—'],
        ['Creada', new Date(inv.created_at).toLocaleString()]
      ].map(([k,v]) => `<div style="display:flex;padding:5px 0;border-bottom:1px dashed var(--border);"><div class="dim" style="flex:0 0 140px;font-size:10px;font-family:'Geist Mono',monospace;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(k)}</div><div style="font-size:12px;flex:1;">${escapeHtml(v===null||v===undefined?'—':v)}</div></div>`).join('');

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;">
          <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
            <div style="font-size:14px;font-weight:600;">Detalles factura</div>
            <button id="dt-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
          </div>
          <div style="padding:14px 18px;">${rows}</div>
        </div>
      `;
      document.body.appendChild(wrap);
      wrap.querySelector('#dt-close').onclick = () => wrap.remove();
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)
  function fmtMoney(n){ if(!isFinite(n)) n = 0; return '$' + Math.round(n).toLocaleString('en'); }

  global.InvoicesView = InvoicesView;
})(window);
