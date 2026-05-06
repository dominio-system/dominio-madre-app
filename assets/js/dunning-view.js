// ============================================
// Dominio Madre · Vista Dunning (Fase 2)
// ============================================
// Cobranza de facturas overdue. Lee v_dunning_queue.
// Acciones: avanzar estado (manda notificación), marcar pagada, write-off.
(function(global){
  'use strict';

  const DunningView = {
    _queue: [],
    _filter: 'all',  // all|email|reminder|final|written_off

    async render(){
      const view = document.querySelector('.view[data-view="dunning"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Cobranza</div><div class="page-sub" id="dv-sub">NEGOCIO · COBRANZA AUTOMATIZADA</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="dv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="dv-run-sweep">⚡ Correr sweep ahora</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">OVERDUE</div><div class="kpi-value" id="dv-count" style="color:var(--warn);">—</div><div class="kpi-trend">facturas</div></div>
          <div class="kpi-card"><div class="kpi-label">EN RIESGO</div><div class="kpi-value" id="dv-total" style="color:var(--danger);">—</div><div class="kpi-trend down">monto total</div></div>
          <div class="kpi-card"><div class="kpi-label">RECUPERADO 30D</div><div class="kpi-value" id="dv-recovered" style="color:var(--success);">—</div><div class="kpi-trend up">invoices pagadas tras dunning</div></div>
          <div class="kpi-card"><div class="kpi-label">WRITTEN OFF</div><div class="kpi-value" id="dv-writtenoff">—</div><div class="kpi-trend">incobrables</div></div>
        </div>

        <div class="filter-pill-card" style="margin-top:12px;">
          <span class="filter-label">DUNNING STATE</span>
          <button class="filter-pill-btn active" data-df="all"         onclick="DunningView.setFilter('all')">Todas <span class="count">(<span data-dv-count="all">0</span>)</span></button>
          <button class="filter-pill-btn"        data-df="email"       onclick="DunningView.setFilter('email')">📧 Email <span class="count">(<span data-dv-count="email">0</span>)</span></button>
          <button class="filter-pill-btn"        data-df="reminder"    onclick="DunningView.setFilter('reminder')">⏰ Reminder <span class="count">(<span data-dv-count="reminder">0</span>)</span></button>
          <button class="filter-pill-btn"        data-df="final"       onclick="DunningView.setFilter('final')">⚠ Final <span class="count">(<span data-dv-count="final">0</span>)</span></button>
          <button class="filter-pill-btn"        data-df="written_off" onclick="DunningView.setFilter('written_off')">✕ Write-off <span class="count">(<span data-dv-count="written_off">0</span>)</span></button>
          <span style="margin-left:auto;font-size:10px;color:var(--text3);font-family:'Geist Mono',monospace;" id="dv-filter-info">— de —</span>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">Queue priorizado</div>
            <div class="panel-sub">ordenado por prioridad (monto × días overdue)</div>
          </div>
          <table class="tbl">
            <thead>
              <tr>
                <th class="sortable">Factura</th>
                <th class="sortable">Cliente</th>
                <th class="sortable">Outstanding</th>
                <th class="sortable">Vencida hace</th>
                <th class="sortable">Dunning state</th>
                <th class="sortable">Intentos</th>
                <th class="sortable">Último envío</th>
                <th class="sortable">Próximo</th>
                <th style="text-align:right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="dv-tbody"><tr><td colspan="9" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Cómo funciona</div></div>
          <div style="padding:14px;font-size:11px;color:var(--text2);line-height:1.7;">
            <div>• El cron <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">cron-dunning-sweep</code> corre cada día a las 08:30 UTC.</div>
            <div>• Progresión automática: <code>day_0 → day_3 → day_7 → day_14 → day_30 → written_off</code>.</div>
            <div>• Cada avance inserta una <strong>notification</strong> que n8n/workflow procesará para mandar email o WhatsApp.</div>
            <div>• "Correr sweep ahora" dispara el cron manualmente (útil para testing).</div>
            <div>• Puedes avanzar manualmente cualquier invoice del queue con los botones de acción.</div>
          </div>
        </div>
      `;

      document.getElementById('dv-refresh').onclick = () => this.load();
      document.getElementById('dv-run-sweep').onclick = () => this.runSweep();
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('dv-run-sweep'), 'billing:write');

      await this.load();
    },

    async load(){
      try {
        document.getElementById('dv-sub').textContent = 'NEGOCIO · CARGANDO…';
        const [queue, recovered, writtenOff] = await Promise.all([
          global.sbGet('v_dunning_queue', 'select=*&order=priority_score.desc.nullslast'),
          // Recuperado 30d = invoices ahora paid que tuvieron dunning_attempts > 0 y paid_at > 30d
          global.sbGet('invoices', `select=amount_paid_cents&status=eq.paid&dunning_attempts=gt.0&paid_at=gte.${new Date(Date.now()-30*864e5).toISOString()}`).catch(()=>[]),
          global.sbGet('invoices', 'select=amount_due_cents&dunning_state=eq.written_off').catch(()=>[])
        ]);
        this._queue = queue || [];

        const totalCents = this._queue.reduce((s,q) => s + (q.amount_outstanding_cents || 0), 0);
        const recoveredCents = (recovered || []).reduce((s,i) => s + (i.amount_paid_cents||0), 0);
        const writtenOffCount = (writtenOff || []).length;

        document.getElementById('dv-count').textContent = this._queue.length;
        document.getElementById('dv-total').textContent = '$' + Math.round(totalCents/100).toLocaleString('en');
        document.getElementById('dv-recovered').textContent = '$' + Math.round(recoveredCents/100).toLocaleString('en');
        document.getElementById('dv-writtenoff').textContent = writtenOffCount;

        this.renderTable();
        document.getElementById('dv-sub').textContent = `NEGOCIO · ${this._queue.length} EN QUEUE`;
      } catch(err){
        document.getElementById('dv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    setFilter(f){
      this._filter = f;
      document.querySelectorAll('.filter-pill-btn[data-df]').forEach(t => t.classList.toggle('active', t.dataset.df === f));
      this.renderTable();
    },

    _filteredQueue(){
      if(this._filter === 'all') return this._queue;
      return this._queue.filter(q => (q.dunning_state || 'email').toLowerCase() === this._filter);
    },

    _updateFilterCounts(){
      const counts = { all: this._queue.length, email:0, reminder:0, final:0, written_off:0 };
      this._queue.forEach(q => {
        const k = (q.dunning_state || 'email').toLowerCase();
        if(counts[k] !== undefined) counts[k]++;
      });
      Object.entries(counts).forEach(([k,v]) => {
        const el = document.querySelector(`[data-dv-count="${k}"]`);
        if(el) el.textContent = v;
      });
    },

    renderTable(){
      const tbody = document.getElementById('dv-tbody');
      this._updateFilterCounts();
      const rows = this._filteredQueue();
      const info = document.getElementById('dv-filter-info');
      if(info) info.textContent = `${rows.length} de ${this._queue.length}`;

      if(rows.length === 0){
        tbody.innerHTML = `<tr><td colspan="9" style="padding:0;">${global.MadreUtils.emptyState({
          icon:'✓', title:this._queue.length === 0 ? 'Sin facturas en cobranza' : 'Sin facturas con este filtro',
          body: this._queue.length === 0 ? 'Todas las facturas están al día o escritas-off.' : 'Cambia el filtro para ver otras facturas.'
        })}</td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('billing:write');
      tbody.innerHTML = rows.map(q => {
        const cur = (q.currency||'usd').toUpperCase();
        const outstanding = (q.amount_outstanding_cents||0)/100;
        const stateColors = {
          none:        '<span class="chip chip-off">NONE</span>',
          day_0:       '<span class="chip chip-warn">DAY 0</span>',
          day_3:       '<span class="chip chip-warn">DAY 3</span>',
          day_7:       '<span class="chip chip-warn" style="background:rgba(242,201,76,0.2);">DAY 7</span>',
          day_14:      '<span class="chip chip-err">DAY 14</span>',
          day_30:      '<span class="chip chip-err">DAY 30</span>',
          written_off: '<span class="chip chip-off">WRITTEN OFF</span>'
        };
        const stateChip = stateColors[q.dunning_state] || '<span class="chip chip-off">—</span>';

        const actions = [];
        if(canWrite){
          actions.push(`<button class="icon-btn" title="Avanzar dunning" onclick="DunningView.advance('${q.id}','email')">▶</button>`);
          actions.push(`<button class="icon-btn" title="Marcar pagada" onclick="DunningView.markPaid('${q.id}')" style="color:var(--success);">✓</button>`);
          actions.push(`<button class="icon-btn" title="Write off" onclick="DunningView.writeOff('${q.id}')" style="color:var(--danger);">Ø</button>`);
        }

        return `
          <tr>
            <td><strong>${escapeHtml(q.number || q.id.slice(0,8))}</strong></td>
            <td>${escapeHtml(q.empresa || q.client_nombre || '—')}<div class="dim" style="font-size:10px;">${escapeHtml(q.client_email || '')}</div></td>
            <td class="num"><strong style="color:var(--danger);">${cur} ${outstanding.toLocaleString('en',{minimumFractionDigits:2})}</strong></td>
            <td class="num" style="color:${q.days_overdue > 30 ? 'var(--danger)' : 'var(--warn)'};">${q.days_overdue} días</td>
            <td>${stateChip}</td>
            <td class="num">${q.dunning_attempts || 0}</td>
            <td class="num dim">${q.last_dunning_at ? `<span data-ts="${escapeHtml(q.last_dunning_at)}">${relativeTime(q.last_dunning_at)}</span>` + ' · ' + (q.last_dunning_channel||'').toUpperCase() : '—'}</td>
            <td class="num dim">${q.next_dunning_at ? `<span data-ts="${escapeHtml(q.next_dunning_at)}">${relativeTime(q.next_dunning_at)}</span>` : '<span style="color:var(--text3);">—</span>'}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>
        `;
      }).join('');
    },

    async advance(invoiceId, channel='email'){
      if(!(await confirmDanger('Avanzar dunning', 'Se enviará una notificación al cliente y el estado avanzará al siguiente nivel (email → reminder → final → write-off).', 'Avanzar'))) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/rest/v1/rpc/fn_advance_dunning`, {
          method: 'POST',
          headers: { ...global.sbHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_invoice_id: invoiceId, p_channel: channel })
        });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const newState = await r.json();
        global.toast?.(`Dunning avanzado: ${newState}`, 'success');
        await this.load();
      } catch(err){
        global.toast?.('Error: ' + err.message, 'err');
      }
    },

    async markPaid(invoiceId){
      if(!window.InvoicesView){
        // Minimal inline fallback
        try {
          await global.Payments.markInvoicePaid(invoiceId, { method: 'manual' });
          global.toast?.('Marcada pagada', 'success');
          await this.load();
        } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
        return;
      }
      // Reusar modal de InvoicesView: primero setear invoices
      if(!window.InvoicesView._invoices?.length){
        await window.InvoicesView.load();
      }
      window.InvoicesView.openMarkPaid(invoiceId);
      // Refrescar al cerrar
      setTimeout(() => this.load(), 2000);
    },

    async writeOff(invoiceId){
      if(!(await confirmDanger('Write-off · marcar incobrable', 'La factura se marcará como incobrable y saldrá del pipeline de cobranza. El monto contará como pérdida en el reporte de revenue.', 'Write-off'))) return;
      try {
        await global.sbPatch('invoices', invoiceId, {
          status: 'uncollectible',
          dunning_state: 'written_off',
          written_off_at: new Date().toISOString(),
          next_dunning_at: null
        });
        global.toast?.('Write-off aplicado', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async runSweep(){
      if(!global.RBAC?.can('billing:write')){ global.toast?.('Sin permiso', 'err'); return; }
      if(!(await confirmDanger('Correr sweep ahora', 'Se ejecutará el cron-dunning-sweep manualmente y avanzará el estado de TODAS las invoices elegibles. Puede enviar emails masivos.', 'Correr sweep'))) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/functions/v1/cron-dunning-sweep`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}'
        });
        const result = await r.json().catch(()=>({}));
        if(!r.ok) throw new Error(result.error || `HTTP ${r.status}`);
        global.toast?.(`Sweep completo: ${result.started_dunning||0} iniciadas, ${result.advanced||0} avanzadas`, 'success');
        await this.load();
      } catch(err){
        global.toast?.('Error: ' + err.message, 'err');
      }
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.DunningView = DunningView;
})(window);
