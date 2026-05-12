// ============================================
// Command Center v2 (Migración v1.0.9)
// ============================================
// Layout nuevo del Command Center · reemplaza el "Pulso por área" 6-cards.
//
// Componentes:
//   1. Bar chart "Revenue por día" con month navigator + tooltip + stats
//   2. Activity feed (lee v_global_activity_feed o invoices recientes)
//   3. Health por servicio (lee uptime_checks)
//
// Datos (v1.0.19 · todo conectado a Supabase real):
//   - Bar chart: invoices.paid_at agregado por día (cache 5min · igual a Revenue view)
//   - Activity: v_global_activity_feed
//   - Health: uptime_checks
//
// Hook: se llama desde go('command') · ver topbar-extras y dashboard-madre.html
// ============================================

(function(global){
  'use strict';

  const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

  // Hoy real (no hardcoded · TZ-agnostic para "today" highlighting)
  function getToday(){
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }

  let chartView = null;     // { y, m } estado actual del navegador
  let invoicesCache = null; // [{ amount_paid_cents, paid_at }, ...] · refrescado al render()
  let invoicesCachedAt = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 min

  // ─── Datos reales por mes (lee invoices PAID · agrega por día) ───
  // Antes: seed determinístico fake. Ahora: data real de Supabase.
  // Si la tabla está vacía o falla la query, devuelve días vacíos (sin barras).
  async function getMonthData(y, m){
    const today = getToday();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Lazy-load invoices (cache 5 min)
    if(!invoicesCache || Date.now() - invoicesCachedAt > CACHE_TTL_MS){
      try {
        invoicesCache = await global.sbGet('invoices',
          'status=eq.paid&select=amount_paid_cents,paid_at&order=paid_at.desc&limit=2000'
        ) || [];
        invoicesCachedAt = Date.now();
      } catch(err){
        console.warn('[CommandCenterV2] invoices fetch:', err.message);
        invoicesCache = [];
      }
    }

    // Bucket por día
    const buckets = {};
    for(let d = 1; d <= daysInMonth; d++) buckets[d] = 0;
    (invoicesCache || []).forEach(inv => {
      if(!inv.paid_at) return;
      const d = new Date(inv.paid_at);
      if(d.getFullYear() !== y || d.getMonth() !== m) return;
      buckets[d.getDate()] += (inv.amount_paid_cents || 0) / 100;
    });

    // Marcar future
    const arr = [];
    for(let d = 1; d <= daysInMonth; d++){
      const isFuture = (y > today.y) || (y === today.y && m > today.m) || (y === today.y && m === today.m && d > today.d);
      if(isFuture){
        arr.push({ day:d, value:null, future:true });
      } else {
        arr.push({ day:d, value: Math.round(buckets[d]), future:false });
      }
    }
    return arr;
  }

  // Compatibilidad temporal con código legacy (alias síncrono que devuelve cache)
  // Si el cache no está cargado, devuelve días vacíos. Si ya cargó, agrega del cache.
  function genMonthData(y, m){
    const today = getToday();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const buckets = {};
    for(let d = 1; d <= daysInMonth; d++) buckets[d] = 0;
    (invoicesCache || []).forEach(inv => {
      if(!inv.paid_at) return;
      const d = new Date(inv.paid_at);
      if(d.getFullYear() !== y || d.getMonth() !== m) return;
      buckets[d.getDate()] += (inv.amount_paid_cents || 0) / 100;
    });
    const arr = [];
    for(let d = 1; d <= daysInMonth; d++){
      const isFuture = (y > today.y) || (y === today.y && m > today.m) || (y === today.y && m === today.m && d > today.d);
      arr.push(isFuture ? { day:d, value:null, future:true } : { day:d, value: Math.round(buckets[d]), future:false });
    }
    return arr;
  }

  function navMonth(delta){
    const today = getToday();
    let y = chartView.y, m = chartView.m + delta;
    if(m < 0){ m = 11; y--; }
    if(m > 11){ m = 0; y++; }
    if(y > today.y || (y === today.y && m > today.m)) return;
    const minDate = today.y * 12 + today.m - 12;
    if(y * 12 + m < minDate) return;
    chartView = { y, m };
    renderBarChart();
  }
  function navToday(){
    const today = getToday();
    chartView = { y: today.y, m: today.m };
    renderBarChart();
  }

  function renderBarChart(){
    const today = getToday();
    if(!chartView) chartView = { y: today.y, m: today.m };
    const data = genMonthData(chartView.y, chartView.m);
    const max = Math.max(1, ...data.map(d => d.value || 0));
    const chart = document.getElementById('cc2-bar-chart');
    const axis  = document.getElementById('cc2-bar-axis');
    if(!chart || !axis) return;
    const isCurrentMonth = (chartView.y === today.y && chartView.m === today.m);

    chart.innerHTML = data.map((d, i) => {
      const isToday = isCurrentMonth && d.day === today.d;
      const cls = d.future ? 'cc2-empty' : (isToday ? 'cc2-today' : '');
      const height = d.value === null ? 6 : (d.value === 0 ? 3 : (d.value / max) * 100);
      let bg = 'linear-gradient(to top,var(--text),var(--text2))';
      let style = `height:${height}%;flex:1;border-radius:2px 2px 0 0;min-height:3px;cursor:pointer;position:relative;transition:opacity 140ms,outline 80ms;`;
      if(d.future){ bg = 'transparent'; style += `border:1px dashed var(--border2);height:6px!important;cursor:default;opacity:0.5;`; }
      else if(isToday){ bg = 'linear-gradient(to top,var(--accent),var(--text))'; style += `outline:1px solid var(--accent);outline-offset:1px;`; }
      style += `background:${bg};`;
      return `<div class="cc2-bar ${cls}" data-i="${i}" style="${style}"></div>`;
    }).join('');

    // Axis ticks
    const ticks = [];
    for(let d = 1; d <= data.length; d++){
      if(d === 1 || d === data.length || d % 5 === 0) ticks.push(d);
    }
    axis.innerHTML = ticks.map(t => `<span>${String(t).padStart(2,'0')}</span>`).join('');

    // Stats
    const validValues = data.filter(d => !d.future && d.value > 0);
    const total = validValues.reduce((s, d) => s + d.value, 0);
    const avg = validValues.length > 0 ? Math.round(total / validValues.length) : 0;
    const best = validValues.reduce((b, d) => d.value > (b?.value || 0) ? d : b, null);
    setText('cc2-m-total',  '$' + total.toLocaleString('en'));
    setText('cc2-m-avg',    '$' + avg.toLocaleString('en'));
    setText('cc2-m-best',   best ? `${MONTHS_SHORT[chartView.m]} ${best.day} · $${best.value}` : '—');
    setText('cc2-m-active', validValues.length + '/' + data.length);

    // Header current
    setText('cc2-mn-current', `${MONTHS_ES[chartView.m]} ${chartView.y}`);
    const prev = document.getElementById('cc2-mn-prev');
    const next = document.getElementById('cc2-mn-next');
    if(prev) prev.disabled = false;
    if(next) next.disabled = isCurrentMonth;

    // Tooltip
    const tooltip = document.getElementById('cc2-bar-tooltip');
    chart.querySelectorAll('.cc2-bar').forEach(b => {
      b.addEventListener('mouseenter', (e) => {
        const i = parseInt(b.dataset.i);
        const d = data[i];
        if(!d || d.future){ tooltip.classList.remove('show'); tooltip.style.opacity='0'; return; }
        const date = new Date(chartView.y, chartView.m, d.day);
        const dayLabel = date.toLocaleDateString('es-MX',{ weekday:'long', day:'numeric', month:'long' });
        setText('cc2-bt-date',  dayLabel);
        setText('cc2-bt-value', '$' + (d.value || 0).toLocaleString('en'));
        setText('cc2-bt-meta',  d.value === 0 ? 'sin ventas este día' : (d.value > avg ? '↑ por encima del promedio' : '↓ debajo del promedio'));
        const rect = b.getBoundingClientRect();
        const wrap = chart.parentElement.getBoundingClientRect();
        tooltip.style.left = (rect.left - wrap.left + rect.width / 2) + 'px';
        tooltip.style.opacity = '1';
      });
      b.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
      b.addEventListener('mouseover', () => { b.style.opacity = '1'; b.style.outline = '1px solid var(--accent)'; b.style.outlineOffset = '1px'; });
      b.addEventListener('mouseout',  () => {
        const d = data[parseInt(b.dataset.i)];
        const isToday = isCurrentMonth && d?.day === today.d;
        b.style.opacity = '';
        if(!isToday && !d?.future) b.style.outline = '';
      });
    });
  }

  function setText(id, txt){
    const el = document.getElementById(id);
    if(el) el.textContent = txt;
  }
  function escape(s){
    return global.MadreUtils?.escapeHtml ? global.MadreUtils.escapeHtml(s) :
      String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ─── Activity feed (lee de v_global_activity_feed · existente en madre) ───
  // v1.0.38 · limit 8 → 10. Altura del contenedor locked en CSS (.feed-scroll-wrap 380px),
  // scroll interno con fades top/bottom para que el cuadro no descuadre el grid.
  // Match KIND_ICON ahora soporta event_type con prefijo "lead.", "appointment.", "invoice."
  // que es el formato real de v_global_activity_feed (antes hacia toLowerCase sobre el
  // event_type completo y nunca pegaba — todos caian a "default" icono "·").
  async function loadActivityFeed(){
    const el = document.getElementById('cc2-feed');
    const wrap = document.getElementById('cc2-feed-wrap');
    if(!el) return;
    try {
      const rows = await global.sbGet('v_global_activity_feed', 'order=created_at.desc&limit=10&select=*').catch(() => []);
      if(!Array.isArray(rows) || rows.length === 0){
        el.innerHTML = `<div class="feed-row"><div class="feed-icon">·</div><div class="feed-body dim">Sin actividad reciente</div><div class="feed-time">—</div></div>`;
        if(wrap) wrap.classList.add('no-scroll-top','no-scroll-bottom');
        return;
      }
      const KIND_ICON = { lead:'+', appointment:'→', invoice:'$', client:'+', ticket:'!', incident:'!', deploy:'↻', default:'·' };
      const KIND_CLASS = { lead:'ok', appointment:'ok', invoice:'ok', client:'ok', ticket:'warn', incident:'warn', deploy:'', default:'' };
      el.innerHTML = rows.map(r => {
        // event_type viene como "lead.created", "ticket.created", etc · tomamos el prefijo
        const fullKind = (r.kind || r.event_type || 'default').toLowerCase();
        const k = fullKind.split('.')[0];
        const icon = KIND_ICON[k] || KIND_ICON.default;
        const cls  = KIND_CLASS[k] || '';
        const ts = r.created_at ? (global.MadreUtils?.relativeTime?.(r.created_at) || r.created_at) : '—';
        return `
          <div class="feed-row">
            <div class="feed-icon ${cls}">${icon}</div>
            <div class="feed-body">${escape(r.title || r.summary || r.description || 'Evento')}${r.subtitle ? ' · <span class="dim">'+escape(r.subtitle)+'</span>' : ''}</div>
            <div class="feed-time">${escape(ts)}</div>
          </div>`;
      }).join('');
      const meta = document.getElementById('cc2-feed-meta');
      if(meta) meta.textContent = `últimos ${rows.length}`;

      // Actualizar fades de scroll arriba/abajo + listener una sola vez
      if(wrap){
        const updateFades = () => {
          const atTop    = el.scrollTop <= 4;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
          wrap.classList.toggle('no-scroll-top', atTop);
          wrap.classList.toggle('no-scroll-bottom', atBottom);
        };
        if(!el._fadesWired){
          el.addEventListener('scroll', updateFades);
          el._fadesWired = true;
        }
        updateFades();
      }
    } catch(err){
      el.innerHTML = `<div class="feed-row"><div class="feed-icon" style="color:var(--danger);">!</div><div class="feed-body" style="color:var(--danger);">${escape(err.message || 'error')}</div></div>`;
    }
  }

  // ─── Health table (lee uptime_checks) ───
  async function loadHealth(){
    const el = document.getElementById('cc2-health');
    if(!el) return;
    try {
      const rows = await global.sbGet('uptime_checks', 'enabled=eq.true&order=service.asc&select=service,last_status,last_latency_ms,uptime_30d_pct').catch(() => []);
      if(!Array.isArray(rows) || rows.length === 0){
        el.innerHTML = `<div style="padding:14px;color:var(--text3);font-size:11px;text-align:center;">Sin servicios monitoreados</div>`;
        return;
      }
      const STATUS_BADGE = {
        ok:   { color:'var(--success)', label:'● OK' },
        slow: { color:'var(--warn)',    label:'● SLOW' },
        fail: { color:'var(--danger)',  label:'● FAIL' },
      };
      el.innerHTML = `
        <table class="tbl" style="width:100%;font-size:11px;">
          <tbody>
            ${rows.map(r => {
              const st = STATUS_BADGE[(r.last_status || 'ok').toLowerCase()] || { color:'var(--text3)', label:'? —' };
              const up30 = r.uptime_30d_pct != null ? parseFloat(r.uptime_30d_pct).toFixed(2) + '%' : '—';
              const lat = r.last_latency_ms != null ? r.last_latency_ms + 'ms' : '—';
              return `
                <tr>
                  <td style="padding:8px 14px;font-weight:500;border-bottom:1px solid var(--border);">${escape(r.service || '?')}</td>
                  <td style="padding:8px 14px;border-bottom:1px solid var(--border);"><span style="color:${st.color};font-family:'Geist Mono',monospace;font-size:10px;">${st.label}</span></td>
                  <td style="padding:8px 14px;border-bottom:1px solid var(--border);" class="dim">${up30}</td>
                  <td style="padding:8px 14px;border-bottom:1px solid var(--border);" class="dim">${lat}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch(err){
      el.innerHTML = `<div style="padding:14px;color:var(--danger);font-size:11px;">Error: ${escape(err.message || 'desconocido')}</div>`;
    }
  }

  // ─── API pública ───
  global.cc2NavMonth = navMonth;
  global.cc2NavToday = navToday;
  global.CommandCenterV2 = {
    async render(){
      const today = getToday();
      if(!chartView) chartView = { y: today.y, m: today.m };
      // Cargar invoices cache primero (para que el bar chart muestre data real desde el inicio)
      await getMonthData(chartView.y, chartView.m);
      renderBarChart();
      loadActivityFeed();
      loadHealth();
    },
  };

  // Auto-render si la vista command está activa
  document.addEventListener('DOMContentLoaded', () => {
    if(document.querySelector('.view[data-view="command"].active')){
      setTimeout(() => global.CommandCenterV2.render(), 100);
    }
  });
})(window);
