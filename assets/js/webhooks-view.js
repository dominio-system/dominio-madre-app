// ============================================
// Dominio Madre · Vista Webhooks (Fase 3)
// ============================================
// CRUD + test delivery + log de entregas
(function(global){
  'use strict';

  const AVAILABLE_EVENTS = [
    'lead.created', 'lead.updated', 'lead.converted',
    'appointment.created', 'appointment.confirmed', 'appointment.completed', 'appointment.canceled', 'appointment.paid',
    'invoice.created', 'invoice.paid', 'invoice.overdue', 'invoice.dunning_advanced',
    'subscription.created', 'subscription.canceled', 'subscription.renewed',
    'client.created', 'client.churned',
    'payment.received', 'payment.failed',
    'ticket.created', 'ticket.resolved'
  ];

  const WebhooksView = {
    _webhooks: [],
    _deliveries: [],

    async render(){
      const view = document.querySelector('.view[data-view="webhooks"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Webhooks</div><div class="page-sub" id="wv-sub">PLATAFORMA · OUTBOUND + INBOUND</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="wv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="wv-new">+ Nuevo webhook</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">ACTIVOS</div><div class="kpi-value" id="wv-active">—</div><div class="kpi-trend up">recibiendo eventos</div></div>
          <div class="kpi-card"><div class="kpi-label">SUCCESS RATE</div><div class="kpi-value" id="wv-success" style="color:var(--success);">—</div><div class="kpi-trend">últimas 100</div></div>
          <div class="kpi-card"><div class="kpi-label">FALLOS 24H</div><div class="kpi-value" id="wv-fails" style="color:var(--danger);">—</div><div class="kpi-trend down">deliveries fallidos</div></div>
          <div class="kpi-card"><div class="kpi-label">LATENCIA AVG</div><div class="kpi-value" id="wv-latency">—</div><div class="kpi-trend">ms p50</div></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Webhooks configurados</div><div class="panel-sub" id="wv-count">—</div></div>
          <table class="tbl">
            <thead>
              <tr><th class="sortable">Nombre / URL</th><th class="sortable">Dir</th><th class="sortable">Eventos</th><th class="sortable">Status</th><th class="sortable">Stats</th><th class="sortable">Última</th><th style="text-align:right;">Acciones</th></tr>
            </thead>
            <tbody id="wv-tbody"><tr><td colspan="7" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Últimas entregas</div><div class="panel-sub">log del webhook_dispatcher</div></div>
          <table class="tbl">
            <thead><tr><th class="sortable">Timestamp</th><th class="sortable">Event</th><th class="sortable">Webhook</th><th class="sortable">HTTP</th><th class="sortable">Duración</th><th class="sortable">Resultado</th></tr></thead>
            <tbody id="wv-deliveries-tbody"><tr><td colspan="6" class="dim" style="text-align:center;padding:20px;">—</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('wv-refresh').onclick = () => this.load();
      document.getElementById('wv-new').onclick = () => this.openCreateModal();
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('wv-new'), 'webhooks:write');
      await this.load();
    },

    async load(){
      try {
        document.getElementById('wv-sub').textContent = 'PLATAFORMA · CARGANDO…';
        const [webhooks, deliveries] = await Promise.all([
          global.sbGet('webhooks', 'select=*&order=created_at.desc'),
          global.sbGet('webhook_deliveries', 'select=*,webhooks(name,url)&order=created_at.desc&limit=30').catch(()=>[])
        ]);
        this._webhooks = webhooks || [];
        this._deliveries = deliveries || [];
        this.renderKPIs();
        this.renderTable();
        this.renderDeliveries();
        document.getElementById('wv-sub').textContent = `PLATAFORMA · ${this._webhooks.length} WEBHOOKS`;
      } catch(err){
        document.getElementById('wv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    renderKPIs(){
      const active = this._webhooks.filter(w => w.status === 'active').length;
      document.getElementById('wv-active').textContent = active;

      const last100 = this._deliveries.slice(0, 100);
      const success = last100.filter(d => d.delivered).length;
      const successRate = last100.length ? Math.round((success/last100.length)*100) : 0;
      document.getElementById('wv-success').textContent = last100.length ? successRate + '%' : '—';

      const d24 = new Date(Date.now() - 24*864e5);
      const fails24 = this._deliveries.filter(d => !d.delivered && new Date(d.created_at) >= d24).length;
      document.getElementById('wv-fails').textContent = fails24;

      const durations = last100.map(d => d.duration_ms).filter(x => x != null).sort((a,b) => a-b);
      const p50 = durations.length ? durations[Math.floor(durations.length/2)] : 0;
      document.getElementById('wv-latency').textContent = p50 ? Math.round(p50) + ' ms' : '—';
    },

    renderTable(){
      const tbody = document.getElementById('wv-tbody');
      document.getElementById('wv-count').textContent = `${this._webhooks.length} webhooks`;

      if(this._webhooks.length === 0){
        tbody.innerHTML = `<tr><td colspan="7" class="dim" style="text-align:center;padding:30px;">
          <div style="font-size:13px;margin-bottom:6px;">Sin webhooks configurados.</div>
          <div style="font-size:11px;">Crea uno para recibir eventos de Dominio en tiempo real.</div>
        </td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('webhooks:write');
      tbody.innerHTML = this._webhooks.map(w => {
        const statusChip = w.status === 'active'
          ? '<span class="chip chip-ok"><span class="chip-dot"></span>ACTIVE</span>'
          : w.status === 'paused'
            ? '<span class="chip chip-warn">PAUSED</span>'
            : '<span class="chip chip-err">FAILED</span>';
        const dirChip = w.direction === 'outbound'
          ? '<span class="chip chip-aria" style="background:rgba(232,232,232,0.1);">OUT →</span>'
          : '<span class="chip chip-off">← IN</span>';

        const total = (w.success_count || 0) + (w.failure_count || 0);
        const successPct = total ? Math.round((w.success_count/total)*100) : 0;

        const actions = [];
        if(canWrite){
          if(w.direction === 'outbound'){
            actions.push(`<button class="icon-btn" title="Probar" onclick="WebhooksView.test('${w.id}')">⚡</button>`);
          }
          if(w.status === 'active'){
            actions.push(`<button class="icon-btn" title="Pausar" onclick="WebhooksView.pause('${w.id}')">⏸</button>`);
          } else {
            actions.push(`<button class="icon-btn" title="Activar" onclick="WebhooksView.activate('${w.id}')">▶</button>`);
          }
          actions.push(`<button class="icon-btn" title="Editar" onclick="WebhooksView.edit('${w.id}')">✎</button>`);
          actions.push(`<button class="icon-btn" title="Eliminar" onclick="WebhooksView.delete('${w.id}')" style="color:var(--danger);">✕</button>`);
        }

        const eventsShow = (w.events||[]).slice(0,3).map(e => `<code style="font-size:8px;padding:1px 4px;background:var(--card2);border-radius:3px;margin-right:2px;">${escapeHtml(e)}</code>`).join('');

        return `
          <tr>
            <td>
              <strong>${escapeHtml(w.name || w.provider || 'unnamed')}</strong>
              <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(w.url)}">${escapeHtml(w.url)}</div>
            </td>
            <td>${dirChip}</td>
            <td>${eventsShow}${(w.events||[]).length > 3 ? `<span class="dim" style="font-size:9px;">+${(w.events||[]).length-3}</span>` : ''}</td>
            <td>${statusChip}</td>
            <td class="num dim" style="font-size:10px;">
              <span style="color:var(--success);">${w.success_count||0}</span> / <span style="color:var(--danger);">${w.failure_count||0}</span>
              ${total ? `<div style="color:var(--text3);">${successPct}% ok</div>` : ''}
            </td>
            <td class="num dim">${w.last_triggered_at ? timeAgo(w.last_triggered_at) : '—'}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>`;
      }).join('');
    },

    renderDeliveries(){
      const tbody = document.getElementById('wv-deliveries-tbody');
      if(this._deliveries.length === 0){
        tbody.innerHTML = `<tr><td colspan="6" class="dim" style="text-align:center;padding:20px;">Sin entregas registradas aún.</td></tr>`;
        return;
      }
      tbody.innerHTML = this._deliveries.slice(0, 30).map(d => {
        const httpColor = d.response_status >= 200 && d.response_status < 300 ? 'var(--success)'
                       : d.response_status >= 400 ? 'var(--danger)'
                       : d.response_status === 0 ? 'var(--text3)' : 'var(--warn)';
        return `
          <tr>
            <td class="num dim">${new Date(d.created_at).toLocaleString()}</td>
            <td><code style="font-size:10px;">${escapeHtml(d.event_type||'—')}</code></td>
            <td class="dim" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.webhooks?.name || d.webhooks?.url || d.webhook_id || '—')}</td>
            <td class="num" style="color:${httpColor};">${d.response_status || '—'}</td>
            <td class="num dim">${d.duration_ms || '—'} ms</td>
            <td>${d.delivered ? '<span class="chip chip-ok">OK</span>' : '<span class="chip chip-err">FAIL</span>'}</td>
          </tr>`;
      }).join('');
    },

    openCreateModal(existing){
      if(!global.RBAC?.can('webhooks:write')){ global.toast?.('Sin permiso', 'err'); return; }

      const eventCheckboxes = AVAILABLE_EVENTS.map(ev => `
        <label style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px;cursor:pointer;">
          <input type="checkbox" class="wv-event" value="${ev}" ${existing?.events?.includes(ev) ? 'checked' : ''}>
          <code style="font-size:10px;">${ev}</code>
        </label>
      `).join('');

      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">${existing ? 'Editar webhook' : 'Nuevo webhook'}</div>
          <button id="wh-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">NOMBRE</div>
            <input id="wh-name" type="text" value="${escapeHtml(existing?.name||'')}" placeholder="Ej: Zapier CRM sync" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">URL</div>
            <input id="wh-url" type="url" value="${escapeHtml(existing?.url||'')}" placeholder="https://ejemplo.com/webhook" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">DIRECCIÓN</div>
            <select id="wh-direction" ${existing ? 'disabled' : ''} style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="outbound" ${existing?.direction==='outbound' ? 'selected' : ''}>Outbound (Dominio → Externo)</option>
              <option value="inbound" ${existing?.direction==='inbound' ? 'selected' : ''}>Inbound (Externo → Dominio)</option>
            </select></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PROVIDER</div>
            <input id="wh-provider" type="text" value="${escapeHtml(existing?.provider||'custom')}" placeholder="custom / zapier / slack" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">SECRET (HMAC-SHA256)</div>
            <input id="wh-secret" type="text" value="${escapeHtml(existing?.secret_ciphertext||'')}" placeholder="Dejar vacío para generar automáticamente" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:11px;font-family:'Geist Mono',monospace;">
            <div class="dim" style="font-size:9px;margin-top:4px;">Tu endpoint usará este secret para validar la firma <code>X-Dominio-Signature</code>.</div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">EVENTOS</div>
            <div style="max-height:200px;overflow-y:auto;padding:8px;background:var(--card2);border:1px solid var(--border);border-radius:5px;">${eventCheckboxes}</div>
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="wh-cancel">Cancelar</button>
          <button class="btn primary" id="wh-save">${existing ? 'Guardar cambios' : 'Crear'}</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;">${body}</div>`;
      document.body.appendChild(wrap);

      const close = () => wrap.remove();
      wrap.querySelector('#wh-close').onclick = close;
      wrap.querySelector('#wh-cancel').onclick = close;
      wrap.querySelector('#wh-save').onclick = async () => {
        const name = wrap.querySelector('#wh-name').value.trim();
        const url = wrap.querySelector('#wh-url').value.trim();
        const direction = wrap.querySelector('#wh-direction').value;
        const provider = wrap.querySelector('#wh-provider').value.trim() || 'custom';
        let secret = wrap.querySelector('#wh-secret').value.trim();
        const events = Array.from(wrap.querySelectorAll('.wv-event:checked')).map(i => i.value);

        if(!name){ global.toast?.('Nombre requerido', 'err'); return; }
        if(!url || !url.startsWith('http')){ global.toast?.('URL inválida', 'err'); return; }
        if(events.length === 0){ global.toast?.('Selecciona al menos un evento', 'err'); return; }

        // Auto-generar secret si vacío
        if(!secret){
          const arr = new Uint8Array(24); crypto.getRandomValues(arr);
          secret = 'whsec_' + Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
        }

        const payload = { name, url, direction, provider, events, secret_ciphertext: secret, status: 'active' };
        try {
          if(existing){
            await global.sbPatch('webhooks', existing.id, payload);
            global.toast?.('Webhook actualizado', 'success');
          } else {
            await global.sbInsert('webhooks', payload);
            global.toast?.(`Webhook creado. Secret: ${secret.slice(0,15)}…`, 'success');
          }
          close();
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    edit(id){ const w = this._webhooks.find(x => x.id === id); if(w) this.openCreateModal(w); },

    async test(id){
      if(!(await confirmDanger('Enviar test ping', 'Se enviará un evento test.ping al endpoint para verificar conectividad.', 'Enviar'))) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/functions/v1/webhook-dispatcher`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_type: 'test.ping', payload: { webhook_id: id, test: true, timestamp: new Date().toISOString() } })
        });
        const result = await r.json();
        if(result.dispatched === 0){
          global.toast?.('Tu webhook no tiene "test.ping" en eventos. Agrégalo o prueba con uno suscrito.', 'warn');
        } else {
          global.toast?.(`Test enviado: ${result.delivered}/${result.dispatched} ok`, result.failed ? 'warn' : 'success');
        }
        setTimeout(() => this.load(), 1000);
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async pause(id){
      try { await global.sbPatch('webhooks', id, { status: 'paused' }); global.toast?.('Pausado', 'success'); await this.load(); }
      catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },
    async activate(id){
      try { await global.sbPatch('webhooks', id, { status: 'active' }); global.toast?.('Activado', 'success'); await this.load(); }
      catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },
    async delete(id){
      if(!(await confirmDanger('Eliminar webhook', 'El webhook se eliminará junto con todo su historial de entregas. Esta acción no se puede deshacer.', 'Eliminar'))) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/rest/v1/webhooks?id=eq.${id}`, { method:'DELETE', headers: global.sbHeaders() });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        global.toast?.('Eliminado', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)
  // timeAgo es local: formato compacto sin "hace " distinto a MadreUtils.relativeTime
  function timeAgo(iso){
    const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
    if(s < 60) return s + 's';
    if(s < 3600) return Math.floor(s/60) + 'm';
    if(s < 86400) return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  }

  global.WebhooksView = WebhooksView;
})(window);
