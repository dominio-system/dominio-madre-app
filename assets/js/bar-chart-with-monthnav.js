// ============================================
// Bar Chart con Month Navigator (1:1 cliente v2.2.6)
// ============================================
// Componente reusable: pinta un mes de barras día-por-día con tooltip,
// estadísticas, y navegador prev/next/HOY. Igual al cliente.
//
// Uso:
//   MadreBarChart.create({
//     containerId: 'rev-bar-container',  // div donde inyectar
//     monthNavId:  'rev-month-nav',      // contenedor del month-nav (vacío)
//     statsId:     'rev-bar-stats',      // contenedor de stats abajo (vacío)
//     getDataForMonth: async (year, month) => [{day:1, value:149, future:false}, ...],
//     formatValue: (v) => '$' + v.toLocaleString('en'),
//     mode: 'today-active',  // 'today-active' resalta hoy · 'plain' no
//   })
// ============================================

(function(global){
  'use strict';

  const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  const MONTHS_SHORT = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

  function getToday(){
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
  }

  function escape(s){
    return global.MadreUtils?.escapeHtml ? global.MadreUtils.escapeHtml(s) :
      String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function create(opts){
    const o = Object.assign({
      mode: 'today-active',
      formatValue: (v) => '$' + (v || 0).toLocaleString('en'),
      maxBackMonths: 12,
    }, opts);

    if(!o.containerId || !o.monthNavId) {
      console.warn('[BarChart] containerId + monthNavId requeridos');
      return null;
    }
    if(typeof o.getDataForMonth !== 'function') {
      console.warn('[BarChart] getDataForMonth requerido');
      return null;
    }

    const today = getToday();
    let view = { y: today.y, m: today.m };

    const container = document.getElementById(o.containerId);
    const navEl     = document.getElementById(o.monthNavId);
    const statsEl   = o.statsId ? document.getElementById(o.statsId) : null;
    if(!container || !navEl) return null;

    // Pintar nav inicial (estructura)
    navEl.innerHTML = `
      <div class="month-nav">
        <button data-bn-prev>‹</button>
        <span class="current" data-bn-cur>—</span>
        <button data-bn-next>›</button>
        <button class="today-btn" data-bn-today>HOY</button>
      </div>
    `;

    // Pintar contenedor de chart (estructura)
    container.innerHTML = `
      <div style="position:relative;">
        <div class="bar-chart" data-bn-chart></div>
        <div class="bar-tooltip" data-bn-tt>
          <div class="bt-date" data-bn-tt-date>—</div>
          <div class="bt-value" data-bn-tt-value>—</div>
          <div class="bt-meta" data-bn-tt-meta>—</div>
        </div>
      </div>
      <div class="bar-axis" data-bn-axis></div>
    `;

    const chartEl = container.querySelector('[data-bn-chart]');
    const axisEl  = container.querySelector('[data-bn-axis]');
    const ttEl    = container.querySelector('[data-bn-tt]');
    const ttDate  = container.querySelector('[data-bn-tt-date]');
    const ttValue = container.querySelector('[data-bn-tt-value]');
    const ttMeta  = container.querySelector('[data-bn-tt-meta]');
    const curEl   = navEl.querySelector('[data-bn-cur]');
    const prevBtn = navEl.querySelector('[data-bn-prev]');
    const nextBtn = navEl.querySelector('[data-bn-next]');
    const todayBtn= navEl.querySelector('[data-bn-today]');

    async function render(){
      const data = await o.getDataForMonth(view.y, view.m);
      if(!Array.isArray(data) || !data.length){
        chartEl.innerHTML = '<div style="flex:1;text-align:center;color:var(--text3);font-size:11px;">Sin datos</div>';
        axisEl.innerHTML = '';
        if(statsEl) statsEl.innerHTML = '';
        return;
      }

      const valid = data.filter(d => !d.future);
      const max = Math.max(1, ...valid.map(d => d.value || 0));
      const isCurrentMonth = (view.y === today.y && view.m === today.m);

      chartEl.innerHTML = data.map((d, i) => {
        const isToday = isCurrentMonth && d.day === today.d && o.mode === 'today-active';
        let cls = 'bar';
        if(d.future) cls += ' empty';
        else if(isToday) cls += ' today';
        else if((d.value || 0) === 0) cls += ' dim';
        const height = d.future ? 6 : (d.value === 0 ? 3 : Math.max(3, (d.value / max) * 100));
        return `<div class="${cls}" data-i="${i}" style="height:${d.future ? 6 : height + '%'};"></div>`;
      }).join('');

      // Axis
      const ticks = [];
      for(let d = 1; d <= data.length; d++){
        if(d === 1 || d === data.length || d % 5 === 0) ticks.push(d);
      }
      axisEl.innerHTML = ticks.map(t => `<span>${String(t).padStart(2,'0')}</span>`).join('');

      // Stats
      if(statsEl){
        const total = valid.reduce((s, d) => s + (d.value || 0), 0);
        const active = valid.filter(d => d.value > 0);
        const avg = active.length ? Math.round(total / active.length) : 0;
        const best = valid.reduce((b, d) => (d.value || 0) > (b?.value || 0) ? d : b, null);
        statsEl.className = 'bar-stats';
        statsEl.innerHTML = `
          <div><span>Total mes:</span><strong>${o.formatValue(total)}</strong></div>
          <div><span>Promedio/día:</span><strong>${o.formatValue(avg)}</strong></div>
          <div><span>Mejor día:</span><strong>${best ? `${MONTHS_SHORT[view.m]} ${best.day} · ${o.formatValue(best.value)}` : '—'}</strong></div>
          <div><span>Días con dato:</span><strong>${active.length}/${data.length}</strong></div>
        `;
      }

      // Header current
      curEl.textContent = `${MONTHS_ES[view.m]} ${view.y}`;
      prevBtn.disabled = false;
      nextBtn.disabled = isCurrentMonth;

      // Tooltip handlers
      chartEl.querySelectorAll('.bar').forEach(b => {
        b.onmouseenter = () => {
          const i = parseInt(b.dataset.i);
          const d = data[i];
          if(!d || d.future){ ttEl.classList.remove('show'); return; }
          const date = new Date(view.y, view.m, d.day);
          ttDate.textContent = date.toLocaleDateString('es-MX',{ weekday:'long', day:'numeric', month:'long' });
          ttValue.textContent = o.formatValue(d.value || 0);
          ttMeta.textContent  = (d.value || 0) === 0 ? 'sin datos este día' : ((d.value || 0) > avg ? '↑ por encima del promedio' : '↓ debajo del promedio');
          const rect = b.getBoundingClientRect();
          const wrap = chartEl.parentElement.getBoundingClientRect();
          ttEl.style.left = (rect.left - wrap.left + rect.width / 2) + 'px';
          ttEl.classList.add('show');
        };
        b.onmouseleave = () => ttEl.classList.remove('show');
      });
    }

    function nav(delta){
      let y = view.y, m = view.m + delta;
      if(m < 0){ m = 11; y--; }
      if(m > 11){ m = 0; y++; }
      if(y > today.y || (y === today.y && m > today.m)) return;
      const minDate = today.y * 12 + today.m - o.maxBackMonths;
      if(y * 12 + m < minDate) return;
      view = { y, m };
      render();
    }
    function nowMonth(){ view = { y: today.y, m: today.m }; render(); }

    prevBtn.onclick  = () => nav(-1);
    nextBtn.onclick  = () => nav(1);
    todayBtn.onclick = nowMonth;

    render();
    return { render, nav, nowMonth };
  }

  global.MadreBarChart = { create };
})(window);
