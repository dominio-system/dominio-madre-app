// ============================================
// Dominio Madre · Vista Payouts (Fase 2)
// ============================================
// Registro manual de pagos que recibes (transferencias, PayPal, Wise, etc.)
// Hoy = manual. Cuando venga Stripe, los payouts reales se sincronizan aquí.
(function(global){
  'use strict';

  const PayoutsView = {
    _payouts: [],

    async render(){
      const view = document.querySelector('.view[data-view="payouts"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Payouts</div><div class="page-sub" id="pv-sub">NEGOCIO · CARGANDO…</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="pv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="pv-new">+ Registrar payout</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">RECIBIDO 30D</div><div class="kpi-value" id="pv-30d">—</div><div class="kpi-trend up">payouts confirmados</div></div>
          <div class="kpi-card"><div class="kpi-label">PENDIENTE</div><div class="kpi-value" id="pv-pending">—</div><div class="kpi-trend">en tránsito</div></div>
          <div class="kpi-card"><div class="kpi-label">ÚLTIMO PAYOUT</div><div class="kpi-value" style="font-size:14px;" id="pv-last">—</div><div class="kpi-trend" id="pv-last-method">—</div></div>
          <div class="kpi-card"><div class="kpi-label">LIFETIME</div><div class="kpi-value" id="pv-lifetime">—</div><div class="kpi-trend">total recibido</div></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head">
            <div class="panel-title">Registro de payouts</div>
            <div class="panel-sub" id="pv-count">—</div>
          </div>
          <table class="tbl">
            <thead>
              <tr><th>Fecha</th><th>Método</th><th>Provider</th><th>Monto</th><th>Fee</th><th>Neto</th><th>Status</th><th>Referencia</th><th style="text-align:right;">Acciones</th></tr>
            </thead>
            <tbody id="pv-tbody"><tr><td colspan="9" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('pv-refresh').onclick = () => this.load();
      document.getElementById('pv-new').onclick = () => this.openCreateModal();
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('pv-new'), 'billing:write');
      await this.load();
    },

    async load(){
      try {
        document.getElementById('pv-sub').textContent = 'NEGOCIO · CARGANDO…';
        this._payouts = await global.sbGet('payouts', 'select=*&order=arrival_date.desc.nullslast,created_at.desc&limit=200') || [];
        this.renderKPIs();
        this.renderTable();
        document.getElementById('pv-sub').textContent = `NEGOCIO · ${this._payouts.length} PAYOUTS`;
      } catch(err){
        document.getElementById('pv-sub').textContent = 'ERROR · ' + err.message;
        document.getElementById('pv-tbody').innerHTML = `<tr><td colspan="9" class="dim" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(err.message)}</td></tr>`;
      }
    },

    renderKPIs(){
      const now = new Date(), d30 = new Date(now - 30*864e5);
      const paid30 = this._payouts.filter(p => p.status === 'paid' && p.arrival_date && new Date(p.arrival_date) >= d30);
      const pending = this._payouts.filter(p => p.status === 'pending' || p.status === 'in_transit');
      const lifetime = this._payouts.filter(p => p.status === 'paid').reduce((s,p) => s + (p.net_cents || p.amount_cents || 0), 0) / 100;
      const sum30 = paid30.reduce((s,p) => s + (p.net_cents || p.amount_cents || 0), 0) / 100;
      const sumPending = pending.reduce((s,p) => s + (p.amount_cents||0), 0) / 100;
      const last = this._payouts.find(p => p.status === 'paid');

      document.getElementById('pv-30d').textContent = '$' + Math.round(sum30).toLocaleString('en');
      document.getElementById('pv-pending').textContent = '$' + Math.round(sumPending).toLocaleString('en');
      document.getElementById('pv-lifetime').textContent = '$' + Math.round(lifetime).toLocaleString('en');
      if(last){
        document.getElementById('pv-last').textContent = last.arrival_date ? new Date(last.arrival_date).toLocaleDateString('es-MX',{day:'numeric',month:'short'}) : '—';
        document.getElementById('pv-last-method').textContent = (last.method || last.provider || '').toUpperCase();
      }
    },

    renderTable(){
      const tbody = document.getElementById('pv-tbody');
      document.getElementById('pv-count').textContent = `${this._payouts.length} registros`;

      if(this._payouts.length === 0){
        tbody.innerHTML = `<tr><td colspan="9" class="dim" style="text-align:center;padding:30px;">
          <div style="font-size:13px;margin-bottom:6px;">Sin payouts registrados aún.</div>
          <div style="font-size:11px;">Usa "+ Registrar payout" cuando recibas una transferencia, PayPal, etc.</div>
        </td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('billing:write');
      tbody.innerHTML = this._payouts.map(p => {
        const cur = (p.currency||'usd').toUpperCase();
        const statusChip = {
          pending: '<span class="chip chip-warn"><span class="chip-dot"></span>PENDING</span>',
          in_transit: '<span class="chip chip-warn"><span class="chip-dot"></span>EN TRÁNSITO</span>',
          paid: '<span class="chip chip-ok"><span class="chip-dot"></span>RECIBIDO</span>',
          failed: '<span class="chip chip-err">FALLIDO</span>',
          canceled: '<span class="chip chip-off">CANCELADO</span>'
        }[p.status] || `<span class="chip chip-off">${escapeHtml(p.status||'—')}</span>`;

        const actions = [];
        if(canWrite){
          if(p.status === 'pending' || p.status === 'in_transit'){
            actions.push(`<button class="icon-btn" title="Marcar recibido" onclick="PayoutsView.markPaid('${p.id}')" style="color:var(--success);">✓</button>`);
          }
          actions.push(`<button class="icon-btn" title="Editar" onclick="PayoutsView.edit('${p.id}')">✎</button>`);
          actions.push(`<button class="icon-btn" title="Eliminar" onclick="PayoutsView.delete('${p.id}')" style="color:var(--danger);">✕</button>`);
        }

        return `
          <tr>
            <td class="num">${p.arrival_date ? new Date(p.arrival_date).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}) : '<span class="dim">—</span>'}</td>
            <td>${escapeHtml((p.method||'—').toUpperCase())}</td>
            <td class="dim">${escapeHtml(p.provider||'manual')}</td>
            <td class="num"><strong>${cur} ${(p.amount_cents/100).toLocaleString('en',{minimumFractionDigits:2})}</strong></td>
            <td class="num dim">${cur} ${((p.fee_cents||0)/100).toLocaleString('en',{minimumFractionDigits:2})}</td>
            <td class="num ok">${cur} ${((p.net_cents||p.amount_cents)/100).toLocaleString('en',{minimumFractionDigits:2})}</td>
            <td>${statusChip}</td>
            <td class="dim" style="font-family:'Geist Mono',monospace;font-size:10px;">${escapeHtml(p.reference || '—')}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>
        `;
      }).join('');
    },

    openCreateModal(existing){
      if(!global.RBAC?.can('billing:write')){ global.toast?.('Sin permiso', 'err'); return; }
      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">${existing ? 'Editar payout' : 'Registrar payout'}</div>
          <button id="pc-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MÉTODO</div>
            <select id="pc-method" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="transferencia">Transferencia bancaria</option>
              <option value="paypal">PayPal</option>
              <option value="wise">Wise</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="zelle">Zelle</option>
              <option value="cashapp">Cash App</option>
              <option value="efectivo">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </select></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MONEDA</div>
            <select id="pc-currency" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="usd">USD</option><option value="mxn">MXN</option><option value="dop">DOP</option><option value="eur">EUR</option><option value="cop">COP</option>
            </select></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">MONTO BRUTO</div>
            <input id="pc-amount" type="number" step="0.01" min="0" placeholder="0.00" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">COMISIÓN</div>
            <input id="pc-fee" type="number" step="0.01" min="0" value="0" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">FECHA LLEGADA</div>
            <input id="pc-date" type="date" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">STATUS</div>
            <select id="pc-status" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="paid">Recibido</option><option value="in_transit">En tránsito</option><option value="pending">Pendiente</option>
            </select></div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">REFERENCIA</div>
            <input id="pc-ref" type="text" placeholder="# transferencia, nombre origen, etc." style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;">
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">NOTAS</div>
            <textarea id="pc-notes" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;min-height:50px;"></textarea>
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="pc-cancel">Cancelar</button>
          <button class="btn primary" id="pc-save">${existing ? 'Guardar cambios' : 'Registrar'}</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;">${body}</div>`;
      document.body.appendChild(wrap);

      // Prefill
      wrap.querySelector('#pc-date').value = (existing?.arrival_date ? new Date(existing.arrival_date) : new Date()).toISOString().slice(0,10);
      if(existing){
        wrap.querySelector('#pc-method').value = existing.method || 'transferencia';
        wrap.querySelector('#pc-currency').value = (existing.currency||'usd').toLowerCase();
        wrap.querySelector('#pc-amount').value = (existing.amount_cents/100).toFixed(2);
        wrap.querySelector('#pc-fee').value = ((existing.fee_cents||0)/100).toFixed(2);
        wrap.querySelector('#pc-status').value = existing.status || 'paid';
        wrap.querySelector('#pc-ref').value = existing.reference || '';
        wrap.querySelector('#pc-notes').value = existing.notes || '';
      }

      const close = () => wrap.remove();
      wrap.querySelector('#pc-close').onclick = close;
      wrap.querySelector('#pc-cancel').onclick = close;
      wrap.querySelector('#pc-save').onclick = async () => {
        const method = wrap.querySelector('#pc-method').value;
        const currency = wrap.querySelector('#pc-currency').value;
        const amount = parseFloat(wrap.querySelector('#pc-amount').value);
        const fee = parseFloat(wrap.querySelector('#pc-fee').value) || 0;
        const date = wrap.querySelector('#pc-date').value;
        const status = wrap.querySelector('#pc-status').value;
        const ref = wrap.querySelector('#pc-ref').value.trim();
        const notes = wrap.querySelector('#pc-notes').value.trim();

        if(!amount || amount <= 0){ global.toast?.('Monto inválido', 'err'); return; }

        const amount_cents = Math.round(amount*100);
        const fee_cents = Math.round(fee*100);
        const payload = {
          method, currency: currency.toLowerCase(),
          amount_cents, fee_cents,
          net_cents: amount_cents - fee_cents,
          status,
          arrival_date: date || null,
          reference: ref || null,
          notes: notes || null,
          provider: 'manual'
        };
        try {
          if(existing){
            await global.sbPatch('payouts', existing.id, payload);
            global.toast?.('Payout actualizado', 'success');
          } else {
            await global.sbInsert('payouts', payload);
            global.toast?.('Payout registrado', 'success');
          }
          close();
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    edit(id){
      const p = this._payouts.find(x => x.id === id);
      if(p) this.openCreateModal(p);
    },

    async markPaid(id){
      try {
        await global.sbPatch('payouts', id, { status: 'paid', arrival_date: new Date().toISOString().slice(0,10) });
        global.toast?.('Marcado como recibido', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async delete(id){
      if(!confirm('¿Eliminar este payout?')) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/rest/v1/payouts?id=eq.${id}`, { method:'DELETE', headers: global.sbHeaders() });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        global.toast?.('Eliminado', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.PayoutsView = PayoutsView;
})(window);
