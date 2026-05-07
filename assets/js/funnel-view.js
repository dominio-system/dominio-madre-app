// ============================================
// Dominio Madre · Vista Funnel Maestro (Fase 3)
// ============================================
// Funnel agregado de todos los clientes · últimos 90 días
// Lee v_funnel_master + v_lead_sources
(function(global){
  'use strict';

  const FunnelView = {
    _data: null,
    _sources: [],
    // v1.0.33 · selector de rango (default 'all' para coincidir con cliente dashboard)
    _range: 'all', // 'all' | '90d' | '30d' | '7d'

    async render(){
      const view = document.querySelector('.view[data-view="funnel"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Embudo</div><div class="page-sub" id="fv-sub">OPERACIÓN · CARGANDO…</div></div>
          <div class="page-actions">
            <select id="fv-range" style="background:var(--card2);border:1px solid var(--border);color:var(--text);padding:5px 11px;border-radius:999px;font-size:11px;font-family:inherit;outline:none;">
              <option value="all" selected>Todo el tiempo</option>
              <option value="90d">Últimos 90 días</option>
              <option value="30d">Últimos 30 días</option>
              <option value="7d">Últimos 7 días</option>
            </select>
            <button class="btn ghost" id="fv-refresh">↻ Refrescar</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">TOTAL LEADS</div><div class="kpi-value" id="fv-leads">—</div><div class="kpi-trend">últimos 90D</div></div>
          <div class="kpi-card"><div class="kpi-label">CERRADOS</div><div class="kpi-value" id="fv-won" style="color:var(--success);">—</div><div class="kpi-trend up">convertidos</div></div>
          <div class="kpi-card"><div class="kpi-label">CONVERSIÓN</div><div class="kpi-value" id="fv-conv">—</div><div class="kpi-trend">lead → cliente</div></div>
          <div class="kpi-card"><div class="kpi-label">PERDIDOS</div><div class="kpi-value" id="fv-lost" style="color:var(--danger);">—</div><div class="kpi-trend down">churn leads</div></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Funnel de leads</div><div class="panel-sub">flujo completo</div></div>
          <div id="fv-stages" style="padding:20px;"></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Funnel de citas</div><div class="panel-sub">appointments ciclo completo</div></div>
          <div id="fv-appt-stages" style="padding:20px;"></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Top lead sources</div><div class="panel-sub" id="fv-sources-count">—</div></div>
          <table class="tbl">
            <thead><tr><th class="sortable">Source</th><th class="sortable">Medium</th><th class="sortable">Campaign</th><th class="sortable">Leads</th><th class="sortable">Calificados</th><th class="sortable">Cerrados</th><th class="sortable">Conversión</th><th class="sortable">Intent prom.</th></tr></thead>
            <tbody id="fv-sources"><tr><td colspan="8" class="dim" style="text-align:center;padding:20px;">Cargando…</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('fv-refresh').onclick = () => this.load();
      // v1.0.33 · range selector
      document.getElementById('fv-range').addEventListener('change', (e) => {
        this._range = e.target.value;
        this.load();
      });
      await this.load();
    },

    // v1.0.33 · genera URL filter dinámico según rango (vacío = sin filtro)
    _dateFilter(){
      if(this._range === 'all') return '';
      const days = { '90d': 90, '30d': 30, '7d': 7 }[this._range] || 90;
      const since = new Date(Date.now() - days * 864e5).toISOString();
      return `&created_at=gte.${encodeURIComponent(since)}`;
    },

    async load(){
      try {
        document.getElementById('fv-sub').textContent = 'OPERACIÓN · CARGANDO…';
        const dateClause = this._dateFilter();
        // Queries directas a tablas (bypass de v_funnel_master para soportar daterange dinámico)
        const [leads, appts, sources] = await Promise.all([
          global.sbGet('leads', `select=status${dateClause}&limit=10000`).catch(()=>[]),
          global.sbGet('appointments', `select=estado,pagado${dateClause}&limit=10000`).catch(()=>[]),
          // v_lead_sources sigue siendo 90d (es agregado UTM · útil en ese rango)
          global.sbGet('v_lead_sources', 'select=*&order=leads_count.desc&limit=25').catch(()=>[])
        ]);
        // Calcular stats client-side (rápido a 50 clientes · ~10k rows max)
        this._data = this._computeFunnel(leads || [], appts || []);
        this._sources = sources || [];
        this.renderStages();
        this.renderSources();
        const labels = { all: 'TODO EL TIEMPO', '90d': 'ÚLTIMOS 90 DÍAS', '30d': 'ÚLTIMOS 30 DÍAS', '7d': 'ÚLTIMOS 7 DÍAS' };
        document.getElementById('fv-sub').textContent = `OPERACIÓN · ${labels[this._range]} · ${(leads||[]).length} LEADS · ${(appts||[]).length} CITAS`;
      } catch(err){
        document.getElementById('fv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    // v1.0.33 · Calcula funnel desde rows raw (mismas formulas que v_funnel_master)
    _computeFunnel(leads, appts){
      const leadsByStatus = (s) => leads.filter(l => l.status === s).length;
      const apptsByEstado = (e) => appts.filter(a => a.estado === e).length;
      const apptsPaid = appts.filter(a => a.pagado === true).length;

      const total_leads = leads.filter(l => ['nuevo','contactado','calificado','cita_agendada','cliente','perdido'].includes(l.status)).length;
      const contacted = leads.filter(l => ['contactado','calificado','cita_agendada','cliente'].includes(l.status)).length;
      const qualified = leads.filter(l => ['calificado','cita_agendada','cliente'].includes(l.status)).length;
      const appointment_scheduled = leads.filter(l => ['cita_agendada','cliente'].includes(l.status)).length;
      const closed_won = leadsByStatus('cliente');
      const closed_lost = leadsByStatus('perdido');

      const pct = (a, b) => b > 0 ? Math.round(a / b * 1000) / 10 : 0;
      return {
        total_leads, contacted, qualified, appointment_scheduled, closed_won, closed_lost,
        pending: apptsByEstado('pending'),
        confirmed: apptsByEstado('confirmed'),
        completed: apptsByEstado('completed'),
        no_show: apptsByEstado('no_show'),
        canceled: apptsByEstado('cancelled'),
        paid: apptsPaid,
        pct_contacted: pct(contacted, total_leads),
        pct_qualified: pct(qualified, contacted),
        pct_appointment: pct(appointment_scheduled, qualified),
        pct_closed: pct(closed_won, appointment_scheduled),
      };
    },

    renderStages(){
      const d = this._data;
      if(!d){ return; }

      // KPIs
      document.getElementById('fv-leads').textContent = d.total_leads || 0;
      document.getElementById('fv-won').textContent   = d.closed_won || 0;
      document.getElementById('fv-lost').textContent  = d.closed_lost || 0;
      const conv = d.total_leads ? Math.round((d.closed_won / d.total_leads) * 100) : 0;
      document.getElementById('fv-conv').textContent  = conv + '%';

      // Stages
      const leadStages = [
        { label: 'Leads nuevos',       count: d.total_leads,            pct: 100, color: 'var(--accent)' },
        { label: 'Contactados',        count: d.contacted,              pct: d.pct_contacted,   color: 'var(--accent)' },
        { label: 'Calificados',        count: d.qualified,              pct: d.pct_qualified,   color: 'var(--warn)' },
        { label: 'Con cita',           count: d.appointment_scheduled,  pct: d.pct_appointment, color: 'var(--warn)' },
        { label: 'Cerrados (clientes)', count: d.closed_won,            pct: d.pct_closed,      color: 'var(--success)' }
      ];
      document.getElementById('fv-stages').innerHTML = this._renderFunnel(leadStages);

      // v1.0.32 · Funnel completo de citas · 6 stages que reflejan los 5 estados DB + flag pagado
      // Orden lógico del ciclo de vida: pending → confirmed → completed → paid (success path)
      // Errores: no_show, cancelled
      const apptStages = [
        { label: 'Pendientes',  count: d.pending   || 0, color: 'var(--text3)' },
        { label: 'Confirmadas', count: d.confirmed || 0, color: 'var(--warn)' },
        { label: 'Completadas', count: d.completed || 0, color: 'var(--success)' },
        { label: 'Pagadas',     count: d.paid      || 0, color: 'var(--success)' },
        { label: 'No-show',     count: d.no_show   || 0, color: 'var(--danger)' },
        { label: 'Canceladas',  count: d.canceled  || 0, color: 'var(--danger)' }
      ];
      const maxAppt = Math.max(1, ...apptStages.map(s => s.count));
      apptStages.forEach(s => s.pct = Math.round((s.count/maxAppt)*100));
      document.getElementById('fv-appt-stages').innerHTML = this._renderFunnel(apptStages);
    },

    _renderFunnel(stages){
      return stages.map(s => `
        <div style="display:grid;grid-template-columns:160px 1fr 80px 60px;gap:12px;align-items:center;padding:8px 0;">
          <div style="font-size:12px;color:var(--text);">${escapeHtml(s.label)}</div>
          <div style="height:26px;border-radius:4px;background:var(--card2);position:relative;overflow:hidden;">
            <div style="height:100%;background:${s.color};opacity:0.6;width:${Math.max(1,s.pct||0)}%;transition:width 400ms;"></div>
          </div>
          <div class="num" style="font-size:13px;font-weight:600;color:var(--text);text-align:right;">${(s.count||0).toLocaleString('en')}</div>
          <div class="num dim" style="font-size:10px;text-align:right;">${Math.round(s.pct||0)}%</div>
        </div>
      `).join('');
    },

    renderSources(){
      const tbody = document.getElementById('fv-sources');
      document.getElementById('fv-sources-count').textContent = `${this._sources.length} fuentes`;

      if(this._sources.length === 0){
        tbody.innerHTML = `<tr><td colspan="8" class="dim" style="text-align:center;padding:24px;">Sin datos de fuentes aún. Agrega UTMs a tus leads.</td></tr>`;
        return;
      }

      tbody.innerHTML = this._sources.map(s => {
        const convColor = s.conversion_pct >= 10 ? 'var(--success)' : s.conversion_pct >= 3 ? 'var(--warn)' : 'var(--danger)';
        return `
          <tr>
            <td><strong>${escapeHtml(s.source)}</strong></td>
            <td class="dim">${escapeHtml(s.medium)}</td>
            <td class="dim" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.campaign)}</td>
            <td class="num"><strong>${s.leads_count}</strong></td>
            <td class="num">${s.qualified || 0}</td>
            <td class="num ok">${s.converted || 0}</td>
            <td class="num" style="color:${convColor};"><strong>${s.conversion_pct || 0}%</strong></td>
            <td class="num dim">${s.avg_intent_score ?? '—'}</td>
          </tr>`;
      }).join('');
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.FunnelView = FunnelView;
})(window);
