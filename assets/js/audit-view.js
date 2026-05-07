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
    _filters: { result: 'all', action: '', dateRange: '7d' },
    // v1.0.26 · cursor pagination
    _PAGE_SIZE: 100,
    _hasMore: true,
    _loadingMore: false,

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

    _dateFilterClause(){
      // PostgREST URL fragment para filtro de fecha
      const r = this._filters.dateRange;
      if(r === 'all') return '';
      const days = { '7d': 7, '30d': 30, '90d': 90 }[r] || 7;
      const since = new Date(Date.now() - days * 864e5).toISOString();
      return `&created_at=gte.${encodeURIComponent(since)}`;
    },

    async loadData(){
      // v1.0.26 · primera página + filtro de fecha
      this._hasMore = true;
      const data = await global.sbGet(
        'audit_log',
        `order=created_at.desc&limit=${this._PAGE_SIZE}&select=*${this._dateFilterClause()}`
      ).catch(() => []);
      this._entries = Array.isArray(data) ? data : [];
      if(this._entries.length < this._PAGE_SIZE) this._hasMore = false;
    },

    async loadMore(){
      if(this._loadingMore || !this._hasMore || this._entries.length === 0) return;
      this._loadingMore = true;
      const btn = document.getElementById('audit-load-more');
      if(btn){ btn.disabled = true; btn.textContent = 'Cargando…'; }
      try {
        const oldest = this._entries[this._entries.length - 1];
        const cursor = oldest?.created_at;
        if(!cursor){ this._hasMore = false; return; }
        const more = await global.sbGet(
          'audit_log',
          `order=created_at.desc&limit=${this._PAGE_SIZE}&select=*&created_at=lt.${encodeURIComponent(cursor)}${this._dateFilterClause()}`
        ).catch(() => []);
        if(!Array.isArray(more) || more.length < this._PAGE_SIZE) this._hasMore = false;
        if(Array.isArray(more) && more.length){
          this._entries = this._entries.concat(more);
        }
        this.renderHeader();
        this.renderTable();
      } finally {
        this._loadingMore = false;
      }
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
        <select id="audit-daterange" style="margin-left:6px;background:var(--card2);border:1px solid var(--border);padding:5px 9px;font-size:11px;color:var(--text);border-radius:999px;font-family:inherit;outline:none;">
          <option value="7d"  ${this._filters.dateRange==='7d'?'selected':''}>7 días</option>
          <option value="30d" ${this._filters.dateRange==='30d'?'selected':''}>30 días</option>
          <option value="90d" ${this._filters.dateRange==='90d'?'selected':''}>90 días</option>
          <option value="all" ${this._filters.dateRange==='all'?'selected':''}>Todo</option>
        </select>
        <input type="text" id="audit-search" placeholder="Buscar acción / actor..." value="${escapeHtml(this._filters.action)}"
               style="margin-left:6px;background:var(--card2);border:1px solid var(--border);padding:5px 11px;font-size:11px;color:var(--text);border-radius:999px;font-family:'Geist Mono',monospace;outline:none;flex:1;min-width:120px;max-width:220px;">
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
      // v1.0.26 · date range selector
      const dateSel = chips.querySelector('#audit-daterange');
      if(dateSel){
        dateSel.addEventListener('change', async (e) => {
          this._filters.dateRange = e.target.value;
          await this.loadData();
          this.renderHeader();
          this.renderFilters();
          this.renderTable();
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
        const q = this._filters.action;
        filtered = filtered.filter(e =>
          (e.action || '').toLowerCase().includes(q) ||
          (e.actor_email || '').toLowerCase().includes(q) ||
          (e.entity_type || '').toLowerCase().includes(q)
        );
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

      // v1.0.26 · footer Cargar más
      const existing = document.getElementById('audit-load-more-row');
      if(existing) existing.remove();
      if(this._hasMore){
        const tfoot = document.createElement('tr');
        tfoot.id = 'audit-load-more-row';
        tfoot.innerHTML = `
          <td colspan="5" style="text-align:center;padding:14px;border-top:1px dashed var(--border);">
            <button id="audit-load-more" class="btn ghost" style="font-size:11px;font-family:'Geist Mono',monospace;letter-spacing:0.5px;" onclick="AuditView.loadMore()">
              ⬇ Cargar 100 más antiguas
            </button>
          </td>`;
        tbody.appendChild(tfoot);
      }
    },

    renderError(err){
      const tbody = document.querySelector('#audit-table tbody');
      if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);text-align:center;padding:24px;">Error: ${escapeHtml(err.message || '')}</td></tr>`;
    },
  };

  global.AuditView = AuditView;
})(window);
