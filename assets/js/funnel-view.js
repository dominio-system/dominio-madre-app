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

    async render(){
      const view = document.querySelector('.view[data-view="funnel"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Funnel Maestro</div><div class="page-sub" id="fv-sub">OPERACIÓN · ÚLTIMOS 90 DÍAS · AGREGADO TODOS LOS CLIENTES</div></div>
          <div class="page-actions"><button class="btn ghost" id="fv-refresh">↻ Refrescar</button></div>
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
            <thead><tr><th>Source</th><th>Medium</th><th>Campaign</th><th>Leads</th><th>Calificados</th><th>Cerrados</th><th>Conversión</th><th>Intent prom.</th></tr></thead>
            <tbody id="fv-sources"><tr><td colspan="8" class="dim" style="text-align:center;padding:20px;">Cargando…</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('fv-refresh').onclick = () => this.load();
      await this.load();
    },

    async load(){
      try {
        document.getElementById('fv-sub').textContent = 'OPERACIÓN · CARGANDO…';
        const [funnel, sources] = await Promise.all([
          global.sbGet('v_funnel_master', 'select=*').catch(()=>[]),
          global.sbGet('v_lead_sources', 'select=*&order=leads_count.desc&limit=25').catch(()=>[])
        ]);
        this._data = funnel?.[0] || null;
        this._sources = sources || [];
        this.renderStages();
        this.renderSources();
        document.getElementById('fv-sub').textContent = 'OPERACIÓN · ÚLTIMOS 90 DÍAS';
      } catch(err){
        document.getElementById('fv-sub').textContent = 'ERROR · ' + err.message;
      }
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

      const apptStages = [
        { label: 'Confirmadas', count: d.confirmed || 0, color: 'var(--warn)' },
        { label: 'Completadas', count: d.completed || 0, color: 'var(--success)' },
        { label: 'Pagadas',     count: d.paid      || 0, color: 'var(--success)' },
        { label: 'No-show',     count: d.no_show   || 0, color: 'var(--danger)' },
        { label: 'Canceladas',  count: d.canceled  || 0, color: 'var(--text3)' }
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

  function escapeHtml(s){ if(s===null||s===undefined) return '—'; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  global.FunnelView = FunnelView;
})(window);
