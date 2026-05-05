// ============================================
// Dominio Madre · Vista Lead Sources (Fase 3)
// ============================================
// Breakdown por UTM source/medium/campaign con conversión.
(function(global){
  'use strict';

  const LeadsView = {
    _sources: [],
    _leads: [],

    async render(){
      const view = document.querySelector('.view[data-view="leads"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Lead Sources</div><div class="page-sub" id="lv-sub">OPERACIÓN · ATRIBUCIÓN POR UTM</div></div>
          <div class="page-actions"><button class="btn ghost" id="lv-refresh">↻ Refrescar</button></div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">FUENTES ACTIVAS</div><div class="kpi-value" id="lv-sources">—</div><div class="kpi-trend">últimos 90D</div></div>
          <div class="kpi-card"><div class="kpi-label">LEADS TOTAL</div><div class="kpi-value" id="lv-total">—</div><div class="kpi-trend up">inbound</div></div>
          <div class="kpi-card"><div class="kpi-label">MEJOR FUENTE</div><div class="kpi-value" style="font-size:14px;" id="lv-best">—</div><div class="kpi-trend" id="lv-best-conv">—</div></div>
          <div class="kpi-card"><div class="kpi-label">CON UTM</div><div class="kpi-value" id="lv-withutm">—</div><div class="kpi-trend">% tracking</div></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head">
            <div class="panel-title">Breakdown por Source</div>
            <div class="panel-sub">ordenado por volumen</div>
          </div>
          <table class="tbl">
            <thead><tr><th class="sortable">Source</th><th class="sortable">Medium</th><th class="sortable">Campaign</th><th class="sortable">Leads</th><th class="sortable">Calificados</th><th class="sortable">Convertidos</th><th class="sortable">Conversión</th><th class="sortable">Intent</th><th class="sortable">Último lead</th></tr></thead>
            <tbody id="lv-tbody"><tr><td colspan="9" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Cómo funciona</div></div>
          <div style="padding:14px;font-size:11px;color:var(--text2);line-height:1.7;">
            <div>• Cuando un lead aterriza en tu app desde ads, guardamos <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">utm_source</code>, <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">utm_medium</code>, <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">utm_campaign</code>.</div>
            <div>• Si no hay UTM, la columna <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">fuente</code> (text) se usa como fallback.</div>
            <div>• Leads sin ninguna atribución cuentan como <code>direct</code>.</div>
            <div>• La data viene de la vista <code>v_lead_sources</code> agregada en los últimos 90 días.</div>
          </div>
        </div>
      `;

      document.getElementById('lv-refresh').onclick = () => this.load();
      await this.load();
    },

    async load(){
      try {
        document.getElementById('lv-sub').textContent = 'OPERACIÓN · CARGANDO…';
        const [sources, leads] = await Promise.all([
          global.sbGet('v_lead_sources', 'select=*'),
          global.sbGet('leads', `select=utm_source,fuente&created_at=gte.${new Date(Date.now()-90*864e5).toISOString()}`)
        ]);
        this._sources = sources || [];
        this._leads = leads || [];
        this.renderKPIs();
        this.renderTable();
        document.getElementById('lv-sub').textContent = `OPERACIÓN · ${this._sources.length} FUENTES`;
      } catch(err){
        document.getElementById('lv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    renderKPIs(){
      const total = this._sources.reduce((s,x) => s + (x.leads_count||0), 0);
      document.getElementById('lv-sources').textContent = this._sources.length;
      document.getElementById('lv-total').textContent   = total;

      const best = this._sources.slice().sort((a,b) => (b.conversion_pct||0) - (a.conversion_pct||0))[0];
      if(best){
        document.getElementById('lv-best').textContent = best.source;
        document.getElementById('lv-best-conv').textContent = `${best.conversion_pct}% conv`;
      }

      const withUtm = this._leads.filter(l => l.utm_source).length;
      const pct = this._leads.length ? Math.round((withUtm/this._leads.length)*100) : 0;
      document.getElementById('lv-withutm').textContent = pct + '%';
    },

    renderTable(){
      const tbody = document.getElementById('lv-tbody');
      if(this._sources.length === 0){
        tbody.innerHTML = `<tr><td colspan="9" class="dim" style="text-align:center;padding:30px;">
          <div style="font-size:13px;margin-bottom:6px;">Sin datos de fuentes.</div>
          <div style="font-size:11px;">Agrega UTMs a los links de tus campañas para empezar a trackear.</div>
        </td></tr>`;
        return;
      }
      tbody.innerHTML = this._sources.map(s => {
        const convColor = s.conversion_pct >= 10 ? 'var(--success)' : s.conversion_pct >= 3 ? 'var(--warn)' : 'var(--danger)';
        return `
          <tr>
            <td><strong>${escapeHtml(s.source)}</strong></td>
            <td class="dim">${escapeHtml(s.medium)}</td>
            <td class="dim" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(s.campaign)}">${escapeHtml(s.campaign)}</td>
            <td class="num"><strong>${s.leads_count}</strong></td>
            <td class="num">${s.qualified || 0}</td>
            <td class="num ok">${s.converted || 0}</td>
            <td class="num" style="color:${convColor};"><strong>${s.conversion_pct || 0}%</strong></td>
            <td class="num dim">${s.avg_intent_score ?? '—'}</td>
            <td class="num dim">${s.last_lead_at ? `<span data-ts="${escapeHtml(s.last_lead_at)}">${relativeTime(s.last_lead_at)}</span>` : '—'}</td>
          </tr>`;
      }).join('');
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.LeadsView = LeadsView;
})(window);
