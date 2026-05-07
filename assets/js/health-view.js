// ============================================
// Dominio Madre · Vista "Salud del Negocio" (v1.0.16)
// ============================================
// Dashboard ejecutivo · 6 KPIs en una pantalla con semáforo arriba.
// Pensado para abrir en la mañana, ver cómo está todo en 5 segundos,
// y entrar a resolver si hay rojo.
//
// KPIs:
//   1. MRR (v_mrr_live)
//   2. Churn 30d (calc desde subscriptions canceled)
//   3. Uptime promedio (uptime_checks avg)
//   4. Tickets abiertos (tickets WHERE status='open')
//   5. Cobranza pendiente (v_dunning_queue count + sum)
//   6. Conversión 30d (v_funnel_master · cita/leads)
//
// Cada card es clickeable · drill-down a vista detalle.
// ============================================

(function(global){
  'use strict';

  const { escapeHtml, relativeTime } = global.MadreUtils;

  const HealthView = {
    _data: {},
    _refreshTimer: null,

    async render(){
      const view = document.querySelector('.view[data-view="health"]');
      if(!view) return;

      // Estructura inicial (skeleton)
      view.innerHTML = `
        <div class="page-head">
          <div>
            <div class="page-title">Salud del Negocio</div>
            <div class="page-sub" id="hv-sub">EJECUTIVO · cargando…</div>
          </div>
          <div class="page-actions">
            <button class="btn ghost" id="hv-refresh">↻ Refrescar</button>
          </div>
        </div>

        <!-- Semáforo arriba -->
        <div id="hv-semaphore" style="display:flex;gap:14px;margin-bottom:16px;flex-wrap:wrap;"></div>

        <!-- 6 KPIs -->
        <div class="kpi-strip" style="grid-template-columns:repeat(3,1fr);gap:14px;">
          <div class="kpi-card" style="cursor:pointer;" onclick="go('revenue')" title="Click → Ingresos & MRR">
            <div class="kpi-label">MRR</div>
            <div class="kpi-value" id="hv-mrr">—</div>
            <div class="kpi-trend" id="hv-mrr-trend">cargando…</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;" onclick="go('subs')" title="Click → Suscripciones">
            <div class="kpi-label">CHURN 30D</div>
            <div class="kpi-value" id="hv-churn">—</div>
            <div class="kpi-trend" id="hv-churn-trend">cargando…</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;" onclick="go('status')" title="Click → Estado del Sistema">
            <div class="kpi-label">UPTIME 30D</div>
            <div class="kpi-value" id="hv-uptime">—</div>
            <div class="kpi-trend" id="hv-uptime-trend">cargando…</div>
          </div>
        </div>

        <div class="kpi-strip" style="grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px;">
          <div class="kpi-card" style="cursor:pointer;" onclick="go('tickets')" title="Click → Tickets">
            <div class="kpi-label">TICKETS ABIERTOS</div>
            <div class="kpi-value" id="hv-tickets">—</div>
            <div class="kpi-trend" id="hv-tickets-trend">cargando…</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;" onclick="go('dunning')" title="Click → Cobranza">
            <div class="kpi-label">COBRANZA PENDIENTE</div>
            <div class="kpi-value" id="hv-dunning">—</div>
            <div class="kpi-trend" id="hv-dunning-trend">cargando…</div>
          </div>
          <div class="kpi-card" style="cursor:pointer;" onclick="go('funnel')" title="Click → Embudo">
            <div class="kpi-label">CONVERSIÓN 30D</div>
            <div class="kpi-value" id="hv-conv">—</div>
            <div class="kpi-trend" id="hv-conv-trend">cargando…</div>
          </div>
        </div>

        <!-- Resumen textual abajo -->
        <div class="panel" style="margin-top:16px;">
          <div class="panel-head">
            <div class="panel-title">Estado general</div>
            <div class="panel-sub" id="hv-summary-meta">auto-refresh cada 60s</div>
          </div>
          <div class="panel-body" id="hv-summary" style="font-size:12px;line-height:1.7;color:var(--text2);padding:18px;">
            Cargando análisis…
          </div>
        </div>
      `;

      document.getElementById('hv-refresh').onclick = () => this.load();
      await this.load();
      this._scheduleRefresh();
    },

    async load(){
      try {
        const [mrrRows, subs, uptimeChecks, tickets, dunning, funnel] = await Promise.all([
          global.sbGet('v_mrr_live', 'select=*').catch(() => []),
          global.sbGet('subscriptions', `select=status,canceled_at,created_at&canceled_at=gte.${new Date(Date.now()-30*864e5).toISOString()}`).catch(() => []),
          global.sbGet('uptime_checks', 'enabled=eq.true&select=service,uptime_30d_pct,last_status').catch(() => []),
          global.sbGet('tickets', 'status=eq.open&select=id,priority,sla_breach_at').catch(() => []),
          global.sbGet('v_dunning_queue', 'select=invoice_id,outstanding_cents').catch(() => []),
          global.sbGet('v_funnel_master', 'select=*').catch(() => null),
        ]);

        // ─── Procesar datos ───
        const mrr = mrrRows?.[0] || {};
        const mrrTotal = Number(mrr.mrr_total) || 0;

        // Churn 30d: subs canceladas / subs activas al inicio del periodo (aprox)
        const canceled30d = (subs || []).filter(s => s.canceled_at).length;
        const activeSubs = mrr.active_subs || 0;
        const churnPct = activeSubs > 0 ? (canceled30d / (activeSubs + canceled30d)) * 100 : 0;

        // Uptime promedio
        const upChecks = (uptimeChecks || []).filter(u => u.uptime_30d_pct != null);
        const uptimeAvg = upChecks.length > 0
          ? upChecks.reduce((s, u) => s + parseFloat(u.uptime_30d_pct), 0) / upChecks.length
          : null;
        const servicesOk = (uptimeChecks || []).filter(u => u.last_status === 'ok').length;
        const servicesTotal = (uptimeChecks || []).length;

        // Tickets
        const ticketsOpen = (tickets || []).length;
        const breachedSla = (tickets || []).filter(t => t.sla_breach_at && new Date(t.sla_breach_at) < new Date()).length;

        // Cobranza
        const dunningCount = (dunning || []).length;
        const dunningTotal = (dunning || []).reduce((s, d) => s + (d.outstanding_cents || 0) / 100, 0);

        // Conversión: el v_funnel_master suele tener stages · usar la tasa global
        const f = Array.isArray(funnel) ? funnel[0] : funnel;
        const convPct = f?.conv_global_pct != null ? parseFloat(f.conv_global_pct) :
                       (f?.leads_total > 0 ? ((f.cerrados || f.appointments || 0) / f.leads_total) * 100 : 0);

        this._data = { mrrTotal, churnPct, canceled30d, uptimeAvg, servicesOk, servicesTotal, ticketsOpen, breachedSla, dunningCount, dunningTotal, convPct, mrr };

        this._render();
        document.getElementById('hv-sub').textContent = 'EJECUTIVO · 6 KPIs · auto-refresh 60s';
      } catch(err){
        console.warn('[HealthView] load:', err.message);
        document.getElementById('hv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    _render(){
      const d = this._data;
      const $ = (id) => document.getElementById(id);

      // ─── Helpers ───
      const fmt$ = (n) => '$' + Math.round(n).toLocaleString('en');

      // Determinar color por KPI · 🟢 verde / 🟡 amarillo / 🔴 rojo
      const mrrColor = d.mrrTotal > 0 ? 'var(--success)' : 'var(--text3)';
      const churnColor = d.churnPct > 10 ? 'var(--danger)' : d.churnPct > 5 ? 'var(--warn)' : 'var(--success)';
      const uptimeColor = d.uptimeAvg == null ? 'var(--text3)' : d.uptimeAvg >= 99 ? 'var(--success)' : d.uptimeAvg >= 95 ? 'var(--warn)' : 'var(--danger)';
      const ticketsColor = d.breachedSla > 0 ? 'var(--danger)' : d.ticketsOpen > 5 ? 'var(--warn)' : d.ticketsOpen > 0 ? 'var(--text2)' : 'var(--success)';
      const dunningColor = d.dunningCount > 3 ? 'var(--danger)' : d.dunningCount > 0 ? 'var(--warn)' : 'var(--success)';
      const convColor = d.convPct >= 20 ? 'var(--success)' : d.convPct >= 10 ? 'var(--warn)' : d.convPct > 0 ? 'var(--danger)' : 'var(--text3)';

      // KPI 1 · MRR
      $('hv-mrr').textContent = fmt$(d.mrrTotal);
      $('hv-mrr').style.color = mrrColor;
      $('hv-mrr-trend').textContent = `${d.mrr.active_subs || 0} subs activas · ARR ${fmt$(d.mrrTotal * 12)}`;

      // KPI 2 · Churn
      $('hv-churn').textContent = d.churnPct.toFixed(1) + '%';
      $('hv-churn').style.color = churnColor;
      $('hv-churn-trend').textContent = `${d.canceled30d} canceladas últimos 30d`;

      // KPI 3 · Uptime
      $('hv-uptime').textContent = d.uptimeAvg != null ? d.uptimeAvg.toFixed(2) + '%' : '—';
      $('hv-uptime').style.color = uptimeColor;
      $('hv-uptime-trend').textContent = d.servicesTotal > 0 ? `${d.servicesOk}/${d.servicesTotal} servicios OK` : 'sin checks';

      // KPI 4 · Tickets
      $('hv-tickets').textContent = d.ticketsOpen;
      $('hv-tickets').style.color = ticketsColor;
      $('hv-tickets-trend').textContent = d.breachedSla > 0 ? `⚠ ${d.breachedSla} con SLA vencido` : 'todos dentro de SLA';

      // KPI 5 · Cobranza
      $('hv-dunning').textContent = d.dunningCount > 0 ? fmt$(d.dunningTotal) : '$0';
      $('hv-dunning').style.color = dunningColor;
      $('hv-dunning-trend').textContent = d.dunningCount > 0 ? `${d.dunningCount} factura${d.dunningCount === 1 ? '' : 's'} en cola` : 'sin facturas pendientes';

      // KPI 6 · Conversión
      $('hv-conv').textContent = d.convPct.toFixed(1) + '%';
      $('hv-conv').style.color = convColor;
      $('hv-conv-trend').textContent = 'Lead → Cita · 30d';

      // ─── Semáforo ───
      const business = [mrrColor, convColor].includes('var(--danger)') ? 'red' : [mrrColor, convColor].includes('var(--warn)') ? 'yellow' : 'green';
      const ops      = [churnColor, ticketsColor, dunningColor].includes('var(--danger)') ? 'red' : [churnColor, ticketsColor, dunningColor].includes('var(--warn)') ? 'yellow' : 'green';
      const system   = uptimeColor === 'var(--danger)' ? 'red' : uptimeColor === 'var(--warn)' ? 'yellow' : 'green';

      const semColor = (s) => s === 'red' ? 'var(--danger)' : s === 'yellow' ? 'var(--warn)' : 'var(--success)';
      const semText = (s) => s === 'red' ? 'requiere atención' : s === 'yellow' ? 'monitorear' : 'todo OK';

      $('hv-semaphore').innerHTML = `
        <div class="panel" style="flex:1;display:flex;align-items:center;gap:12px;padding:14px 18px;border-left:3px solid ${semColor(business)};">
          <div style="width:10px;height:10px;border-radius:50%;background:${semColor(business)};box-shadow:0 0 10px ${semColor(business)}66;"></div>
          <div style="flex:1;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;font-family:'Geist Mono',monospace;color:var(--text3);">Negocio</div><div style="font-size:13px;color:var(--text);margin-top:3px;">${semText(business)}</div></div>
        </div>
        <div class="panel" style="flex:1;display:flex;align-items:center;gap:12px;padding:14px 18px;border-left:3px solid ${semColor(ops)};">
          <div style="width:10px;height:10px;border-radius:50%;background:${semColor(ops)};box-shadow:0 0 10px ${semColor(ops)}66;"></div>
          <div style="flex:1;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;font-family:'Geist Mono',monospace;color:var(--text3);">Operaciones</div><div style="font-size:13px;color:var(--text);margin-top:3px;">${semText(ops)}</div></div>
        </div>
        <div class="panel" style="flex:1;display:flex;align-items:center;gap:12px;padding:14px 18px;border-left:3px solid ${semColor(system)};">
          <div style="width:10px;height:10px;border-radius:50%;background:${semColor(system)};box-shadow:0 0 10px ${semColor(system)}66;"></div>
          <div style="flex:1;"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;font-family:'Geist Mono',monospace;color:var(--text3);">Sistema</div><div style="font-size:13px;color:var(--text);margin-top:3px;">${semText(system)}</div></div>
        </div>
      `;

      // ─── Resumen textual ───
      const issues = [];
      if(d.dunningCount > 0) issues.push(`<strong>${d.dunningCount} factura${d.dunningCount === 1 ? '' : 's'} en cobranza</strong> por ${fmt$(d.dunningTotal)} · revisa <a onclick="go('dunning')" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Cobranza</a>`);
      if(d.breachedSla > 0) issues.push(`<strong>${d.breachedSla} ticket${d.breachedSla === 1 ? '' : 's'} con SLA vencido</strong> · atender en <a onclick="go('tickets')" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Tickets</a>`);
      if(d.uptimeAvg != null && d.uptimeAvg < 99) issues.push(`Uptime promedio <strong>${d.uptimeAvg.toFixed(2)}%</strong> · investiga en <a onclick="go('status')" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Estado del Sistema</a>`);
      if(d.churnPct > 5) issues.push(`Churn 30d en <strong>${d.churnPct.toFixed(1)}%</strong> · revisa <a onclick="go('subs')" style="color:var(--accent);cursor:pointer;text-decoration:underline;">Suscripciones</a>`);

      const summary = issues.length > 0
        ? `Hay <strong>${issues.length}</strong> punto${issues.length === 1 ? '' : 's'} que requiere${issues.length === 1 ? '' : 'n'} atención:<br><br>` +
          '<ul style="margin-left:20px;line-height:1.9;">' + issues.map(i => `<li>${i}</li>`).join('') + '</ul>'
        : `<strong style="color:var(--success);">Todo en verde.</strong> MRR ${fmt$(d.mrrTotal)} con ${d.mrr.active_subs || 0} subs activas · ${d.servicesOk}/${d.servicesTotal} servicios OK · ${d.ticketsOpen} tickets abiertos sin SLA vencido · sin facturas en cobranza.`;

      document.getElementById('hv-summary').innerHTML = summary;
    },

    _scheduleRefresh(){
      this._stopRefresh();
      this._refreshTimer = setInterval(() => {
        if(global.currentView === 'health'){
          this.load();
        } else {
          this._stopRefresh();
        }
      }, 60_000);
    },

    _stopRefresh(){
      if(this._refreshTimer){ clearInterval(this._refreshTimer); this._refreshTimer = null; }
    },
  };

  global.HealthView = HealthView;
})(window);
