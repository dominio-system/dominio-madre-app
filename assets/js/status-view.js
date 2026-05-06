// ============================================
// Dominio Madre · Vista System Status (Fase 2 v1.0.4)
// ============================================
// Monitoreo de uptime de servicios externos (Supabase, n8n, Stripe, etc.)
// Lee de:
//   · uptime_checks      (1 row por servicio · last_status + uptime_30d_pct)
//   · uptime_check_results (histórico · paginado a 50 últimos)
//
// Auto-refresh: cada 60s mientras la vista está activa.
// Botón "↻ Refrescar" para forzar reload manual.
// ============================================

(function(global){
  'use strict';

  const { escapeHtml, relativeTime, COLORS } = global.MadreUtils;
  const REFRESH_MS = 60_000;

  const StatusView = {
    _refreshTimer: null,
    _checks: [],
    _results: [],
    _refreshing: false,
    _filter: 'all',  // all|ok|slow|fail

    async render(){
      const view = document.querySelector('.view[data-view="status"]');
      if(!view) return;

      try {
        await this.loadData();
        this.renderFilterBar();
        this.renderCards();
        this.renderTable();
        this.renderRefreshButton();
        this.scheduleRefresh();
      } catch(err){
        console.error('[StatusView] render error:', err.message);
        this.renderError(err);
      }
    },

    renderFilterBar(){
      const view = document.querySelector('.view[data-view="status"]');
      if(!view) return;
      let bar = view.querySelector('.filter-pill-card[data-status-filter]');
      if(!bar){
        bar = document.createElement('div');
        bar.className = 'filter-pill-card';
        bar.setAttribute('data-status-filter','');
        // Insertar después del page-head
        const cards = view.querySelector('#status-cards');
        if(cards) cards.parentElement.insertBefore(bar, cards);
        else view.appendChild(bar);
      } else {
        bar = global.MadreUtils.resetNodeListeners(bar);
      }
      const counts = {
        all: this._checks.length,
        ok:   this._checks.filter(c => c.last_status === 'ok').length,
        slow: this._checks.filter(c => c.last_status === 'slow').length,
        fail: this._checks.filter(c => c.last_status === 'fail').length,
      };
      const f = this._filter;
      bar.innerHTML = `
        <span class="filter-label">SERVICIOS</span>
        <button class="filter-pill-btn ${f==='all'?'active':''}"  data-stf="all">Todos <span class="count">(${counts.all})</span></button>
        <button class="filter-pill-btn ${f==='ok'?'active':''}"   data-stf="ok">● OK <span class="count">(${counts.ok})</span></button>
        <button class="filter-pill-btn ${f==='slow'?'active':''}" data-stf="slow">⏱ Slow <span class="count">(${counts.slow})</span></button>
        <button class="filter-pill-btn ${f==='fail'?'active':''}" data-stf="fail">⚠ Fail <span class="count">(${counts.fail})</span></button>
      `;
      bar.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          this._filter = b.dataset.stf;
          this.renderFilterBar();
          this.renderCards();
        });
      });
    },

    _filteredChecks(){
      if(this._filter === 'all') return this._checks;
      return this._checks.filter(c => (c.last_status || 'unknown').toLowerCase() === this._filter);
    },

    async loadData(){
      // Trae los servicios activos con su último estado + 50 últimos resultados
      const [checks, results] = await Promise.all([
        global.sbGet('uptime_checks', 'enabled=eq.true&order=service.asc&select=*').catch(() => []),
        global.sbGet('uptime_check_results', 'order=checked_at.desc&limit=50&select=*').catch(() => []),
      ]);
      this._checks = Array.isArray(checks) ? checks : [];
      this._results = Array.isArray(results) ? results : [];
    },

    renderCards(){
      const container = document.getElementById('status-cards');
      if(!container) return;

      const sub = document.getElementById('status-sub');
      if(sub){
        const okCount = this._checks.filter(c => c.last_status === 'ok').length;
        const total = this._checks.length;
        sub.textContent = total > 0
          ? `SISTEMA · ${okCount}/${total} servicios OK`
          : 'SISTEMA · sin checks configurados';
      }

      if(this._checks.length === 0){
        container.innerHTML = `<div class="dim" style="grid-column:1/-1;text-align:center;padding:24px;font-size:13px;">No hay servicios monitoreados. Ve a Supabase y agrega rows en uptime_checks.</div>`;
        return;
      }

      container.innerHTML = this._filteredChecks().map(c => {
        const status = (c.last_status || 'unknown').toLowerCase();
        const STATUS_META = {
          'ok':      { color: 'var(--success, #6fcf97)', dot: '🟢', label: 'OK' },
          'slow':    { color: 'var(--warn, #f2c94c)',    dot: '🟡', label: 'Slow' },
          'fail':    { color: 'var(--danger, #eb5757)',  dot: '🔴', label: 'Fail' },
          'unknown': { color: 'var(--text3, #888)',      dot: '⚪', label: 'Sin checks' },
        };
        const meta = STATUS_META[status] || STATUS_META.unknown;
        const lastTs = c.last_checked_at
          ? relativeTime(c.last_checked_at)
          : '—';
        const latency = c.last_latency_ms != null ? `${c.last_latency_ms}ms` : '—';
        const uptime30d = c.uptime_30d_pct != null
          ? `${parseFloat(c.uptime_30d_pct).toFixed(2)}%`
          : '—';

        return `
          <div class="kpi-card" style="border-left:3px solid ${meta.color};">
            <div class="kpi-label">${escapeHtml((c.service || '?').toUpperCase())}</div>
            <div class="kpi-value" style="font-size:18px;color:${meta.color};">${meta.dot} ${meta.label}</div>
            <div class="kpi-trend" style="font-size:10px;line-height:1.6;">
              <div>Latencia: <strong>${latency}</strong></div>
              <div>Uptime 30d: <strong>${uptime30d}</strong></div>
              <div class="dim">Último check: ${lastTs}</div>
            </div>
          </div>
        `;
      }).join('');
    },

    renderTable(){
      const tbody = document.querySelector('#status-table tbody');
      if(!tbody) return;

      if(this._results.length === 0){
        tbody.innerHTML = `<tr><td colspan="5" class="dim" style="text-align:center;padding:24px;">Sin resultados todavía</td></tr>`;
        return;
      }

      tbody.innerHTML = this._results.map(r => {
        const status = (r.status || 'unknown').toLowerCase();
        const STATUS_BADGE = {
          'up':        { color: '#6fcf97', label: 'UP' },
          'down':      { color: '#eb5757', label: 'DOWN' },
          'degraded':  { color: '#f2c94c', label: 'DEGRADED' },
          'ok':        { color: '#6fcf97', label: 'OK' },
          'fail':      { color: '#eb5757', label: 'FAIL' },
          'slow':      { color: '#f2c94c', label: 'SLOW' },
          'unknown':   { color: '#888',    label: '?' },
        };
        const badge = STATUS_BADGE[status] || STATUS_BADGE.unknown;
        const lat = r.latency_ms != null ? `${r.latency_ms}ms` : '—';
        const httpCode = r.http_code != null ? r.http_code : '—';
        const ts = r.checked_at ? relativeTime(r.checked_at) : '—';

        return `
          <tr>
            <td><strong>${escapeHtml(r.service || '?')}</strong></td>
            <td><span style="padding:3px 8px;border-radius:4px;background:${badge.color}22;color:${badge.color};font-family:'Geist Mono',monospace;font-size:10px;letter-spacing:0.5px;">${badge.label}</span></td>
            <td style="font-family:'Geist Mono',monospace;font-size:11px;">${lat}</td>
            <td style="font-family:'Geist Mono',monospace;font-size:11px;">${httpCode}</td>
            <td class="dim" title="${escapeHtml(r.checked_at || '')}">${ts}</td>
          </tr>
        `;
      }).join('');
    },

    renderError(err){
      const container = document.getElementById('status-cards');
      const tbody = document.querySelector('#status-table tbody');
      const msg = `<div class="dim" style="color:var(--danger,#eb5757);">Error cargando: ${escapeHtml(err.message || 'desconocido')}</div>`;
      if(container) container.innerHTML = msg;
      if(tbody) tbody.innerHTML = `<tr><td colspan="5">${msg}</td></tr>`;
    },

    renderRefreshButton(){
      const panel = document.querySelector('.view[data-view="status"] .panel .panel-head');
      if(!panel) return;
      let btn = panel.querySelector('.status-refresh');
      if(btn) return; // ya existe
      btn = document.createElement('button');
      btn.className = 'btn ghost status-refresh';
      btn.style.cssText = 'margin-left:auto;font-size:10px;padding:4px 10px;';
      btn.innerHTML = '↻ Refrescar';
      btn.addEventListener('click', async () => {
        if(this._refreshing) return;
        this._refreshing = true;
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = '· Refrescando…';
        try {
          await this.loadData();
          this.renderCards();
          this.renderTable();
        } catch(err){
          console.warn('[StatusView] refresh manual error:', err.message);
        } finally {
          btn.disabled = false;
          btn.innerHTML = original;
          this._refreshing = false;
        }
      });
      panel.appendChild(btn);
    },

    scheduleRefresh(){
      this.stopRefresh();
      this._refreshTimer = setInterval(() => {
        // Solo refrescar si la vista sigue activa
        if(global.currentView === 'status'){
          this.loadData().then(() => {
            this.renderCards();
            this.renderTable();
          }).catch(() => {});
        } else {
          this.stopRefresh();
        }
      }, REFRESH_MS);
    },

    stopRefresh(){
      if(this._refreshTimer){ clearInterval(this._refreshTimer); this._refreshTimer = null; }
    },
  };

  global.StatusView = StatusView;
})(window);
