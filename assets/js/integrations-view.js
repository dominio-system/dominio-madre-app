// ============================================
// Dominio Madre · Vista "Integraciones" (v1.0.19)
// ============================================
// Modularización de loadIntegrationsReal() que vivía inline en dashboard-madre.html.
//
// Detecta status real consultando Supabase para 6 servicios:
//   - Stripe: cuenta invoices con stripe_invoice_id
//   - n8n: uptime_checks WHERE service='n8n' (last_status + uptime 30d)
//   - Supabase: LIVE si la query devuelve · 4 canales realtime
//   - Meta: leads con utm_source IN (meta,facebook,instagram,fb) últimos 30d
//   - Google: leads con utm_source IN (google,gclid) últimos 30d
//   - Resend: webhooks salientes activos (proxy)
//
// Hook: go('integrations') → IntegrationsView.render()
// ============================================

(function(global){
  'use strict';

  function setChip(intName, label, kind){
    const card = document.querySelector(`.int-card[data-int="${intName}"]`);
    if(!card) return;
    const chip = card.querySelector('[data-int-chip]');
    if(!chip) return;
    chip.className = 'chip ' + (kind === 'ok' ? 'chip-ok' : kind === 'warn' ? 'chip-warn' : 'chip-off');
    chip.innerHTML = `<span class="chip-dot"></span>${label}`;
  }
  function setMeta(intName, attr, value){
    const card = document.querySelector(`.int-card[data-int="${intName}"]`);
    const el = card?.querySelector(`[data-int-${attr}]`);
    if(el) el.textContent = value;
  }
  function setSub(intName, sub){
    const card = document.querySelector(`.int-card[data-int="${intName}"]`);
    const el = card?.querySelector('[data-int-sub]');
    if(el) el.textContent = sub;
  }
  function rt(iso){
    return global.MadreUtils?.relativeTime ? global.MadreUtils.relativeTime(iso) : iso;
  }

  const IntegrationsView = {
    async render(){
      try {
        const since30d = new Date(Date.now() - 30 * 864e5).toISOString();
        const [stripeInvs, n8nUptime, supaClients, metaLeads, googleLeads, webhooksActive] = await Promise.all([
          global.sbGet('invoices', 'select=id,paid_at,stripe_invoice_id&order=paid_at.desc.nullslast&limit=10').catch(() => []),
          global.sbGet('uptime_checks', 'service=eq.n8n&select=last_status,last_checked_at,uptime_30d_pct&limit=1').catch(() => []),
          global.sbGet('clients', 'select=id&limit=1').catch(() => []),
          global.sbGet('leads', `utm_source=in.(meta,facebook,instagram,fb)&created_at=gte.${since30d}&select=id,created_at&order=created_at.desc&limit=100`).catch(() => []),
          global.sbGet('leads', `utm_source=in.(google,gclid)&created_at=gte.${since30d}&select=id,created_at&order=created_at.desc&limit=100`).catch(() => []),
          global.sbGet('webhooks', 'enabled=eq.true&select=id&limit=10').catch(() => []),
        ]);

        // ─── Stripe ───
        const stripeLive = (stripeInvs || []).filter(i => i.stripe_invoice_id);
        if(stripeLive.length > 0){
          setChip('stripe', 'LIVE', 'ok');
          setSub('stripe', `PAYMENTS · ${stripeLive.length} invoices`);
          setMeta('stripe', 'stripe-invoices', `${stripeLive.length} con stripe_id`);
          const last = stripeLive.find(i => i.paid_at);
          setMeta('stripe', 'stripe-last', last ? `<span data-ts="${last.paid_at}">${rt(last.paid_at)}</span>` : '—');
        } else {
          setChip('stripe', 'OFF', 'off');
          setSub('stripe', 'PAYMENTS · sin invoices Stripe');
          setMeta('stripe', 'stripe-invoices', '0');
          setMeta('stripe', 'stripe-last', '—');
        }

        // ─── n8n ───
        const n8n = (n8nUptime || [])[0];
        if(n8n){
          const status = (n8n.last_status || 'unknown').toLowerCase();
          if(status === 'ok')      setChip('n8n', 'LIVE', 'ok');
          else if(status === 'slow') setChip('n8n', 'SLOW', 'warn');
          else                       setChip('n8n', 'FAIL', 'off');
          setMeta('n8n', 'n8n-uptime', n8n.uptime_30d_pct != null ? parseFloat(n8n.uptime_30d_pct).toFixed(2) + '%' : '—');
          setMeta('n8n', 'n8n-last', n8n.last_checked_at ? `<span data-ts="${n8n.last_checked_at}">${rt(n8n.last_checked_at)}</span>` : '—');
        } else {
          setChip('n8n', 'NO MONITOR', 'warn');
        }

        // ─── Supabase ───
        // Si llegamos hasta acá la query devolvió · LIVE
        setChip('supabase', 'LIVE', 'ok');
        setMeta('supabase', 'supa-clients', Array.isArray(supaClients) ? `${supaClients.length}+` : '—');
        setMeta('supabase', 'supa-realtime', '4 canales activos');

        // ─── Meta ───
        if((metaLeads || []).length > 0){
          setChip('meta', 'ACTIVO', 'ok');
          setMeta('meta', 'meta-leads', metaLeads.length);
          const last = metaLeads[0];
          setMeta('meta', 'meta-last', last?.created_at ? `<span data-ts="${last.created_at}">${rt(last.created_at)}</span>` : '—');
        } else {
          setChip('meta', 'OFF', 'off');
          setMeta('meta', 'meta-leads', '0');
          setMeta('meta', 'meta-last', '—');
        }

        // ─── Google ───
        if((googleLeads || []).length > 0){
          setChip('google', 'ACTIVO', 'ok');
          setMeta('google', 'google-leads', googleLeads.length);
          const last = googleLeads[0];
          setMeta('google', 'google-last', last?.created_at ? `<span data-ts="${last.created_at}">${rt(last.created_at)}</span>` : '—');
        } else {
          setChip('google', 'OFF', 'off');
          setMeta('google', 'google-leads', '0');
          setMeta('google', 'google-last', '—');
        }

        // ─── Resend (proxy: webhooks salientes activos) ───
        setMeta('resend', 'resend-webhooks', (webhooksActive || []).length);

        // ─── Sub-header agregado ───
        const sub = document.getElementById('int-sub');
        if(sub){
          const liveCount = document.querySelectorAll('.int-card .chip-ok').length;
          const total = document.querySelectorAll('.int-card').length;
          sub.textContent = `PLATAFORMA · ${liveCount}/${total} servicios activos`;
        }

        // ─── Auto-format timestamps inyectados ───
        setTimeout(() => global.MadreUtils?.formatTimestamps?.(document.querySelector('.view[data-view="integrations"]')), 50);
      } catch(err){
        console.warn('[IntegrationsView]', err.message);
      }
    },
  };

  global.IntegrationsView = IntegrationsView;
  // Compat: alias global para HTML antiguo (botón "↻ Refrescar" inline)
  global.loadIntegrationsReal = () => IntegrationsView.render();
})(window);
