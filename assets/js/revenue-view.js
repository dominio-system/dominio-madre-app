// ============================================
// Dominio Madre · Vista "Ingresos & MRR" (v1.0.19)
// ============================================
// Modularización de loadRevenueReal() que vivía inline en dashboard-madre.html.
//
// Lee de Supabase real:
//   - v_mrr_live (MRR consolidado · ARR · clientes activos)
//   - invoices WHERE status=paid (para el bar chart día-por-día)
//
// Componentes:
//   - 4 KPIs: MRR · ARR · RPC · Clientes pagantes
//   - Bar chart con month navigator (MadreBarChart · 1:1 cliente)
//   - Stripe pill (cambia a LIVE si hay invoices paid)
//
// Hook: go('revenue') → RevenueView.render()
// ============================================

(function(global){
  'use strict';

  const RevenueView = {
    _invoicesCache: null,
    _barInited: false,

    async render(){
      try {
        const [mrrRows, paidInvoices] = await Promise.all([
          global.sbGet('v_mrr_live', 'select=*').catch(() => []),
          // Pull todas las invoices PAID · agregamos por día client-side
          global.sbGet('invoices', 'status=eq.paid&select=amount_paid_cents,paid_at&order=paid_at.desc&limit=2000').catch(() => []),
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

        this._invoicesCache = paidInvoices || [];

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
          // Forzar re-render del mes actual con la data fresca
          document.querySelector('#rev-month-nav [data-bn-today]')?.click();
        }

        // Stripe pill: si hay al menos 1 invoice paid → LIVE
        const stripePill = $('stripe-pill');
        if(stripePill && this._invoicesCache.length > 0){
          stripePill.className = 'pill pill-ok';
          stripePill.innerHTML = '<span class="pill-dot"></span>STRIPE LIVE';
        }
      } catch(err){
        console.warn('[RevenueView]', err.message);
      }
    },

    // Agrega invoices.paid_at por día del mes solicitado · marca future si aplica
    _aggregateByDay(year, month){
      const today = new Date();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const buckets = {};
      for(let d = 1; d <= daysInMonth; d++) buckets[d] = 0;
      (this._invoicesCache || []).forEach(inv => {
        if(!inv.paid_at) return;
        const d = new Date(inv.paid_at);
        if(d.getFullYear() !== year || d.getMonth() !== month) return;
        buckets[d.getDate()] += (inv.amount_paid_cents || 0) / 100;
      });
      return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const isFuture = (year > today.getFullYear()) ||
                         (year === today.getFullYear() && month > today.getMonth()) ||
                         (year === today.getFullYear() && month === today.getMonth() && day > today.getDate());
        return { day, value: buckets[day], future: isFuture };
      });
    },
  };

  global.RevenueView = RevenueView;
  // Compat: mantener loadRevenueReal global para que el HTML antiguo no se rompa
  global.loadRevenueReal = () => RevenueView.render();
})(window);
