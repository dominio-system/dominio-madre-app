// ============================================
// Dominio Madre · Vista Auditoría (Fase 2 v1.0.4)
// ============================================
// Log inmutable de acciones del equipo (RBAC writes, role changes, etc.)
// Lee de:
//   · audit_log (action, entity_type, entity_id, actor_email, diff jsonb, result)
// ============================================

(function(global){
  'use strict';

  const { escapeHtml, relativeTime, resetNodeListeners } = global.MadreUtils;

  const AuditView = {
    _entries: [],
    _filters: { result: 'all', action: '' },

    async render(){
      const view = document.querySelector('.view[data-view="audit"]');
      if(!view) return;

      try {
        await this.loadData();
        this.renderHeader();
        this.renderFilters();
        this.renderTable();
      } catch(err){
        console.error('[AuditView] render error:', err.message);
        this.renderError(err);
      }
    },

    async loadData(){
      // Últimos 100 (paginar más adelante si crece)
      const data = await global.sbGet('audit_log', 'order=created_at.desc&limit=100&select=*').catch(() => []);
      this._entries = Array.isArray(data) ? data : [];
    },

    renderHeader(){
      const sub = document.getElementById('audit-sub');
      if(!sub) return;
      const successCount = this._entries.filter(e => (e.result || '').toLowerCase() === 'success').length;
      sub.textContent = `SISTEMA · ${this._entries.length} ACCIONES · ${successCount} ÉXITO`;
    },

    renderFilters(){
      const panel = document.querySelector('.view[data-view="audit"] .panel .panel-head');
      if(!panel) return;
      let chips = panel.querySelector('.audit-filters');
      if(!chips){
        chips = document.createElement('div');
        chips.className = 'audit-filters';
        chips.style.cssText = 'display:flex;gap:6px;margin-left:auto;flex-wrap:wrap;align-items:center;flex:1;justify-content:flex-end;min-width:0;padding:8px 4px;';
        panel.appendChild(chips);
      } else {
        // Limpiar listeners previos para no acumular handlers
        chips = resetNodeListeners(chips);
      }
      const RESULTS = [
        ['all',     'Todas',    ''],
        ['success', 'Éxito',    '✓'],
        ['failure', 'Fallo',    '✗'],
        ['denied',  'Denegado', '⊘'],
      ];
      // Counts
      const counts = { all: this._entries.length };
      this._entries.forEach(e => {
        const r = (e.result || '').toLowerCase();
        counts[r] = (counts[r] || 0) + 1;
      });
      chips.innerHTML = RESULTS.map(([val,label,icon]) => {
        const count = counts[val] || 0;
        const active = this._filters.result === val ? ' active' : '';
        return `<button class="filter-pill-btn${active}" data-aresult="${val}">${icon ? icon + ' ' : ''}${label} <span class="count">(${count})</span></button>`;
      }).join('') + `
        <input type="text" id="audit-search" placeholder="Buscar acción..." value="${escapeHtml(this._filters.action)}"
               style="margin-left:8px;background:var(--card2);border:1px solid var(--border);padding:5px 11px;font-size:11px;color:var(--text);border-radius:999px;font-family:'Geist Mono',monospace;outline:none;flex:1;min-width:120px;max-width:220px;">
      `;
      chips.querySelectorAll('button[data-aresult]').forEach(b => {
        b.addEventListener('click', () => {
          this._filters.result = b.dataset.aresult;
          this.renderFilters();
          this.renderTable();
        });
      });
      const searchInput = chips.querySelector('#audit-search');
      if(searchInput){
        let timer = null;
        searchInput.addEventListener('input', (e) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            this._filters.action = e.target.value.trim().toLowerCase();
            this.renderTable();
          }, 200);
        });
      }
    },

    renderTable(){
      const tbody = document.querySelector('#audit-table tbody');
      if(!tbody) return;

      let filtered = this._entries;
      if(this._filters.result !== 'all'){
        filtered = filtered.filter(e => (e.result || '').toLowerCase() === this._filters.result);
      }
      if(this._filters.action){
        filtered = filtered.filter(e => (e.action || '').toLowerCase().includes(this._filters.action));
      }

      if(filtered.length === 0){
        tbody.innerHTML = `<tr><td colspan="5" class="dim" style="text-align:center;padding:24px;">${
          this._entries.length === 0
            ? 'Sin entries en audit_log'
            : 'No hay entries con el filtro actual'
        }</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(e => {
        const RESULT_BADGE = {
          success: { color: '#6fcf97', label: '✓' },
          failure: { color: '#eb5757', label: '✗' },
          denied:  { color: '#f2c94c', label: '⊘' },
        };
        const result = (e.result || 'success').toLowerCase();
        const badge = RESULT_BADGE[result] || { color: '#888', label: '?' };
        const ts = e.created_at ? relativeTime(e.created_at) : '—';
        const actor = e.actor_email
          ? escapeHtml(e.actor_email)
          : (e.actor_id ? `<span class="dim" style="font-family:'Geist Mono',monospace;font-size:10px;">${escapeHtml(String(e.actor_id).slice(0,8))}</span>` : '<span class="dim">—</span>');
        const entity = e.entity_type
          ? `<strong>${escapeHtml(e.entity_type)}</strong>${e.entity_id ? `<span class="dim" style="font-family:'Geist Mono',monospace;font-size:10px;margin-left:4px;">${escapeHtml(String(e.entity_id).slice(0,8))}</span>` : ''}`
          : '<span class="dim">—</span>';

        return `
          <tr>
            <td><strong style="font-family:'Geist Mono',monospace;font-size:11px;">${escapeHtml(e.action || '?')}</strong></td>
            <td>${entity}</td>
            <td><span style="color:${badge.color};font-weight:600;font-size:14px;" title="${escapeHtml(result)}">${badge.label}</span></td>
            <td style="font-size:11px;">${actor}</td>
            <td class="dim" title="${escapeHtml(e.created_at || '')}">${ts}</td>
          </tr>
        `;
      }).join('');
    },

    renderError(err){
      const tbody = document.querySelector('#audit-table tbody');
      if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);text-align:center;padding:24px;">Error: ${escapeHtml(err.message || '')}</td></tr>`;
    },
  };

  global.AuditView = AuditView;
})(window);
