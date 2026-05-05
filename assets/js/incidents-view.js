// ============================================
// Dominio Madre · Vista Incidencias (Fase 2 v1.0.4)
// ============================================
// Listado de incidentes (fallas, errores críticos, degradaciones).
// Lee de:
//   · incidents (status: open/investigating/identified/monitoring/resolved)
//             (severity: sev1/sev2/sev3/sev4)
// ============================================

(function(global){
  'use strict';

  const { escapeHtml, relativeTime, resetNodeListeners } = global.MadreUtils;

  const IncidentsView = {
    _incidents: [],
    _filters: { status: 'all', severity: 'all' },

    async render(){
      const view = document.querySelector('.view[data-view="incidents"]');
      if(!view) return;

      try {
        await this.loadData();
        this.renderHeader();
        this.renderFilters();
        this.renderTable();
      } catch(err){
        console.error('[IncidentsView] render error:', err.message);
        this.renderError(err);
      }
    },

    async loadData(){
      const data = await global.sbGet('incidents', 'order=started_at.desc.nullslast,detected_at.desc.nullslast,created_at.desc&limit=50&select=*').catch(() => []);
      this._incidents = Array.isArray(data) ? data : [];
    },

    renderHeader(){
      const sub = document.getElementById('incidents-sub');
      if(!sub) return;
      const active = this._incidents.filter(i => i.status !== 'resolved').length;
      sub.textContent = active > 0
        ? `SISTEMA · ${active} ACTIVA${active === 1 ? '' : 'S'} · ${this._incidents.length} TOTAL`
        : `SISTEMA · 0 ACTIVAS · ${this._incidents.length} TOTAL`;
    },

    renderFilters(){
      // Renderizar filter chips arriba de la tabla (si no existen ya)
      const panel = document.querySelector('.view[data-view="incidents"] .panel .panel-head');
      if(!panel) return;
      let chips = panel.querySelector('.incidents-filters');
      if(!chips){
        chips = document.createElement('div');
        chips.className = 'incidents-filters';
        chips.style.cssText = 'display:flex;gap:6px;margin-left:auto;flex-wrap:wrap;';
        panel.appendChild(chips);
      } else {
        // Limpiar listeners previos para no acumular handlers en cada render
        chips = resetNodeListeners(chips);
      }
      const STATUSES = [
        ['all',          'Todas'],
        ['open',         'Abiertas'],
        ['investigating','Investigando'],
        ['identified',   'Identificadas'],
        ['monitoring',   'Monitoreando'],
        ['resolved',     'Resueltas'],
      ];
      chips.innerHTML = STATUSES.map(([val,label]) => `
        <button class="btn ghost" data-istatus="${val}" style="font-size:10px;padding:4px 10px;${this._filters.status === val ? 'background:var(--card2);color:var(--text);' : ''}">${label}</button>
      `).join('');
      chips.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          this._filters.status = b.dataset.istatus;
          this.renderFilters();
          this.renderTable();
        });
      });
    },

    renderTable(){
      const tbody = document.querySelector('#incidents-table tbody');
      if(!tbody) return;

      let filtered = this._incidents;
      if(this._filters.status !== 'all'){
        filtered = filtered.filter(i => i.status === this._filters.status);
      }

      if(filtered.length === 0){
        tbody.innerHTML = `<tr><td colspan="6" class="dim" style="text-align:center;padding:24px;">${
          this._incidents.length === 0
            ? 'Sin incidentes registrados. Buen indicador 🎉'
            : 'No hay incidentes con el filtro actual'
        }</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(inc => {
        const SEV_BADGE = {
          sev1: { color: '#eb5757', label: 'SEV1', bg: 'rgba(235,87,87,0.15)' },
          sev2: { color: '#f2994a', label: 'SEV2', bg: 'rgba(242,153,74,0.15)' },
          sev3: { color: '#f2c94c', label: 'SEV3', bg: 'rgba(242,201,76,0.15)' },
          sev4: { color: '#888',    label: 'SEV4', bg: 'rgba(136,136,136,0.15)' },
        };
        const STATUS_BADGE = {
          open:          { color: '#eb5757', label: 'OPEN' },
          investigating: { color: '#f2c94c', label: 'INVESTIGANDO' },
          identified:    { color: '#f2994a', label: 'IDENTIFICADA' },
          monitoring:    { color: '#56ccf2', label: 'MONITOREANDO' },
          resolved:      { color: '#6fcf97', label: 'RESUELTA' },
        };
        const sev = SEV_BADGE[inc.severity] || { color: '#888', label: '?', bg: 'rgba(136,136,136,0.15)' };
        const sta = STATUS_BADGE[inc.status] || { color: '#888', label: (inc.status || '?').toUpperCase() };
        const services = Array.isArray(inc.affected_services)
          ? inc.affected_services.join(', ')
          : (inc.affected_services || '—');
        const detected = inc.detected_at || inc.started_at || inc.created_at;
        const detectedFmt = detected ? relativeTime(detected) : '—';
        const resolvedFmt = inc.resolved_at
          ? relativeTime(inc.resolved_at)
          : (inc.status === 'resolved' ? '✓' : '—');

        return `
          <tr>
            <td>
              <strong>${escapeHtml(inc.title || 'Sin título')}</strong>
              ${inc.description ? `<div class="dim" style="font-size:11px;margin-top:3px;line-height:1.4;">${escapeHtml((inc.description || '').slice(0, 100))}${inc.description.length > 100 ? '…' : ''}</div>` : ''}
            </td>
            <td><span style="padding:3px 8px;border-radius:4px;background:${sev.bg};color:${sev.color};font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.5px;font-weight:600;">${sev.label}</span></td>
            <td><span style="padding:3px 8px;border-radius:4px;background:${sta.color}22;color:${sta.color};font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.5px;">${sta.label}</span></td>
            <td class="dim" style="font-size:11px;font-family:'Geist Mono',monospace;">${escapeHtml(services)}</td>
            <td class="dim" title="${escapeHtml(detected || '')}">${detectedFmt}</td>
            <td class="dim">${resolvedFmt}</td>
          </tr>
        `;
      }).join('');
    },

    renderError(err){
      const tbody = document.querySelector('#incidents-table tbody');
      if(tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);text-align:center;padding:24px;">Error: ${escapeHtml(err.message || '')}</td></tr>`;
    },
  };

  global.IncidentsView = IncidentsView;
})(window);
