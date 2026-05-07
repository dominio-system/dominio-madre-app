// ============================================
// Dominio Madre · Vista Equipo · Performance (v1.0.26 · Enterprise)
// ============================================
// Lee v_team_workload (1 row por agente activo) con KPIs:
//   - tickets_open, tickets_sla_breach, resolved_30d
//   - avg_resolution_hours_30d, csat_avg_90d, messages_sent_30d
//
// Útil para founder ver carga del equipo + identificar agentes sobrecargados
// o con SLA roto. Para Enterprise (10+ agentes en organizaciones).
//
// Hook: go('team') → TeamView.render()
// ============================================

(function(global){
  'use strict';

  const TeamView = {
    _rows: [],

    async render(){
      const view = document.querySelector('.view[data-view="team"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Equipo · Performance</div><div class="page-sub" id="tv-team-sub">EQUIPO · CARGANDO…</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="tv-team-refresh">↻ Refrescar</button>
            <button class="btn ghost" id="tv-team-export" title="Descargar CSV">⬇ CSV</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">AGENTES ACTIVOS</div><div class="kpi-value" id="tw-agents">—</div><div class="kpi-trend">team_members</div></div>
          <div class="kpi-card"><div class="kpi-label">TICKETS ABIERTOS</div><div class="kpi-value" id="tw-open" style="color:var(--warn);">—</div><div class="kpi-trend">total asignados</div></div>
          <div class="kpi-card"><div class="kpi-label">SLA ROTO</div><div class="kpi-value" id="tw-breach" style="color:var(--danger);">—</div><div class="kpi-trend down">a tiempo</div></div>
          <div class="kpi-card"><div class="kpi-label">RESUELTOS 30D</div><div class="kpi-value" id="tw-resolved" style="color:var(--success);">—</div><div class="kpi-trend up">último mes</div></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head">
            <div class="panel-title">Carga por agente</div>
            <div class="panel-sub" id="tw-count">—</div>
          </div>
          <table class="tbl">
            <thead><tr>
              <th class="sortable">Agente</th>
              <th class="sortable">Rol</th>
              <th class="sortable">Tickets abiertos</th>
              <th class="sortable">SLA roto</th>
              <th class="sortable">Resueltos 30d</th>
              <th class="sortable">Avg resolución</th>
              <th class="sortable">CSAT 90d</th>
              <th class="sortable">Msgs enviados</th>
            </tr></thead>
            <tbody id="tw-tbody"><tr><td colspan="8" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Cómo funciona</div></div>
          <div style="padding:14px;font-size:11px;color:var(--text2);line-height:1.7;">
            <div>• Vista <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">v_team_workload</code> agrega tickets por <code>assigned_to</code> de cada team_member activo.</div>
            <div>• <strong>SLA roto</strong>: tickets abiertos cuyo <code>sla_deadline</code> ya pasó.</div>
            <div>• <strong>Avg resolución</strong>: promedio de horas entre <code>created_at</code> y <code>resolved_at</code> en últimos 30d.</div>
            <div>• <strong>CSAT</strong>: promedio de <code>satisfaction_score</code> (1-5) en tickets resueltos últimos 90d.</div>
            <div>• Asignar tickets manualmente desde el detalle de cada ticket en la sección Tickets.</div>
          </div>
        </div>
      `;

      document.getElementById('tv-team-refresh').onclick = () => this.load();
      document.getElementById('tv-team-export').onclick = () => this.exportCsv();
      await this.load();
    },

    async load(){
      try {
        document.getElementById('tv-team-sub').textContent = 'EQUIPO · CARGANDO…';
        this._rows = await global.sbGet('v_team_workload', 'select=*') || [];
        this.renderKPIs();
        this.renderTable();
        document.getElementById('tv-team-sub').textContent = `EQUIPO · ${this._rows.length} AGENTES`;
      } catch(err){
        document.getElementById('tv-team-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    renderKPIs(){
      const sum = (k) => this._rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
      document.getElementById('tw-agents').textContent = this._rows.length;
      document.getElementById('tw-open').textContent = sum('tickets_open');
      document.getElementById('tw-breach').textContent = sum('tickets_sla_breach');
      document.getElementById('tw-resolved').textContent = sum('resolved_30d');
    },

    renderTable(){
      const tbody = document.getElementById('tw-tbody');
      const count = document.getElementById('tw-count');
      if(this._rows.length === 0){
        tbody.innerHTML = `<tr><td colspan="8" class="dim" style="text-align:center;padding:30px;">
          <div>Solo hay un team_member (founder).</div>
          <div style="margin-top:6px;font-size:11px;">Cuando agregues agentes, aparecerán aquí con sus métricas de tickets asignados.</div>
        </td></tr>`;
        if(count) count.textContent = '0 agentes';
        return;
      }
      if(count) count.textContent = `${this._rows.length} agente${this._rows.length===1?'':'s'}`;

      tbody.innerHTML = this._rows.map(r => {
        const csatColor = r.csat_avg_90d >= 4.0 ? 'var(--success)'
                        : r.csat_avg_90d >= 3.0 ? 'var(--warn)'
                        : r.csat_avg_90d ? 'var(--danger)' : 'var(--text3)';
        const breachColor = (r.tickets_sla_breach || 0) > 0 ? 'var(--danger)' : 'var(--text3)';
        return `
          <tr>
            <td>
              <strong>${escapeHtml(r.full_name || r.email || '—')}</strong>
              <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">${escapeHtml(r.email || '')}</div>
            </td>
            <td><span class="chip chip-off" style="font-size:9px;">${escapeHtml((r.role||'—').toUpperCase())}</span></td>
            <td class="num"><strong>${r.tickets_open || 0}</strong></td>
            <td class="num" style="color:${breachColor};font-weight:${(r.tickets_sla_breach||0)>0?'600':'400'};">${r.tickets_sla_breach || 0}</td>
            <td class="num">${r.resolved_30d || 0}</td>
            <td class="num dim">${r.avg_resolution_hours_30d ? r.avg_resolution_hours_30d + 'h' : '—'}</td>
            <td class="num" style="color:${csatColor};">${r.csat_avg_90d ? r.csat_avg_90d + '/5' : '—'}</td>
            <td class="num dim">${r.messages_sent_30d || 0}</td>
          </tr>`;
      }).join('');
    },

    exportCsv(){
      if(!global.MadreExport){ global.toast?.('Export no disponible', 'err'); return; }
      global.MadreExport.csv({
        filename: `equipo-performance-${new Date().toISOString().slice(0,10)}.csv`,
        headers: ['Agente','Email','Rol','Tickets abiertos','SLA roto','Resueltos 30d','Avg resolution hours','CSAT 90d','Mensajes 30d'],
        rows: this._rows.map(r => [
          r.full_name || '', r.email || '', r.role || '',
          r.tickets_open || 0, r.tickets_sla_breach || 0, r.resolved_30d || 0,
          r.avg_resolution_hours_30d || '', r.csat_avg_90d || '',
          r.messages_sent_30d || 0,
        ]),
      });
    },
  };

  global.TeamView = TeamView;
})(window);
