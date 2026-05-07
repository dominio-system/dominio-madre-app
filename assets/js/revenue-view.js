// ============================================
// Dominio Madre · Vista "Ingresos & MRR" (v1.0.26)
// ============================================
// v1.0.26 · refactor a v_revenue_daily (server-side aggregate)
// Antes: limit=2000 invoices client-side aggregate (~240KB transferred)
// Ahora: 1 row por día últimos 90 días (~5KB) · server-side aggregate
//
// Lee de Supabase real:
//   - v_mrr_live      (MRR consolidado · ARR · clientes activos)
//   - v_revenue_daily (1 row por día x 90 días con paid_cents_sum + invoices_count)
//
// Hook: go('revenue') → RevenueView.render()
// ============================================

(function(global){
  'use strict';

  const RevenueView = {
    _dailyCache: null,
    _barInited: false,

    async render(){
      try {
        const [mrrRows, daily] = await Promise.all([
          global.sbGet('v_mrr_live', 'select=*').catch(() => []),
          // v1.0.26 · server-side aggregate · solo 90 rows
          global.sbGet('v_revenue_daily', 'select=*&order=day.asc').catch(() => []),
        ]);

        const mrr = mrrRows?.[0] || {};
        const total = Number(mrr.mrr_total) || 0;
        const arr = total * 12;
        const activeSubs = Number(mrr.active_subs) || 0;
        const rpc = activeSubs ? total / activeSubs : 0;

        const $ = (id) => document.getElementById(id);
        if($('rev-mrr'))     $('rev-mrr').textContent     = '$' + Math.round(total).toLocaleString('en');
        if($('rev-arr'))     $('rev-arr').textContent     = '$' + Math.round(arr).toLocaleString('en');
        if($('rev-rpc'))     $('rev-rpc').textContent     = '$' + Math.round(rpc).toLocaleString('en');
        if($('rev-clients')) $('rev-clients').textContent = activeSubs;

        // Indexar daily rows por día de fecha para acceso O(1)
        // daily row shape: { day: '2026-05-07', paid_cents_sum, paid_amount, invoices_count, day_of_week, month, year }
        this._dailyCache = new Map();
        (daily || []).forEach(d => {
          const key = d.day; // 'YYYY-MM-DD'
          this._dailyCache.set(key, d);
        });

        // Bar chart con month navigator
        if(global.MadreBarChart && !this._barInited){
          this._barInited = true;
          global.MadreBarChart.create({
            containerId: 'rev-bar-container',
            monthNavId:  'rev-month-nav',
            statsId:     'rev-bar-stats',
            formatValue: (v) => '$' + Math.round(v).toLocaleString('en'),
            getDataForMonth: (year, month) => this._aggregateByDay(year, month),
          });
        } else if(this._barInited){
          document.querySelector('#rev-month-nav [data-bn-today]')?.click();
        }

        // Stripe pill: si hay invoices paid (paid_amount > 0 en algún día)
        const hasRevenue = Array.from(this._dailyCache.values()).some(d => Number(d.paid_amount) > 0);
        const stripePill = $('stripe-pill');
        if(stripePill && hasRevenue){
          stripePill.className = 'pill pill-ok';
          stripePill.innerHTML = '<span class="pill-dot"></span>STRIPE LIVE';
        }
      } catch(err){
        console.warn('[RevenueView]', err.message);
      }
    },

    // v1.0.26 · ya no hace aggregate · solo lookup en cache O(1) por día
    _aggregateByDay(year, month){
      const today = new Date();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        // Construir key 'YYYY-MM-DD' de this date
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const row = this._dailyCache?.get(dateStr);
        const value = row ? Number(row.paid_amount) || 0 : 0;
        const isFuture = (year > today.getFullYear()) ||
                         (year === today.getFullYear() && month > today.getMonth()) ||
                         (year === today.getFullYear() && month === today.getMonth() && day > today.getDate());
        return { day, value, future: isFuture };
      });
    },
  };

  global.RevenueView = RevenueView;
  // Compat: mantener loadRevenueReal global para que el HTML antiguo no se rompa
  global.loadRevenueReal = () => RevenueView.render();
})(window);
