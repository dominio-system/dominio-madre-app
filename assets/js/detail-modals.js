// ============================================
// Detail Modals (Migración v1.0.9)
// ============================================
// Modales detalle reusables · igual al mockup v2:
//   - Cliente (5 tabs: Overview / Subscripción / Payments / ARIA / Timeline)
//   - Invoice (line items + payment intent + acciones)
//   - Confirm dialog destructivo
//
// Uso:
//   openClienteDetail(clientId)
//   openInvoiceDetail(invoiceId)
//   confirmDanger(title, body, onConfirm, btnLabel?)
//
// Datos:
//   - Cliente: lee de `clients`, `subscriptions`, `invoices`, `aria_messages` (filtered)
//   - Invoice: lee de `invoices` + payment_intent metadata
// ============================================

(function(global){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const escape = (s) => global.MadreUtils?.escapeHtml ? global.MadreUtils.escapeHtml(s) :
    String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtMoney = (n) => '$' + (Number(n)||0).toLocaleString('en', { minimumFractionDigits:2, maximumFractionDigits:2 });
  const fmtDate = (iso) => {
    if(!iso) return '—';
    try {
      const tz = global.MadreTZ?.getActiveTZ?.() || undefined;
      return new Date(iso).toLocaleDateString('es-MX', { day:'numeric', month:'short', year:'numeric', timeZone:tz });
    } catch { return iso; }
  };

  // ─── Crear DOM si no existe ───
  function ensureDOM(){
    if($('det-cliente-overlay')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <!-- CLIENTE DETAIL -->
      <div class="det-overlay" id="det-cliente-overlay" onclick="if(event.target.id==='det-cliente-overlay')closeClienteDetail()" style="display:none;position:fixed;inset:0;z-index:520;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
        <div class="det" style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:720px;max-width:94vw;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;">
          <div class="det-head" style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0;">
            <div class="det-avatar" id="det-cli-avatar" style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,var(--card2),var(--card3));border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">—</div>
            <div style="flex:1;min-width:0;">
              <div class="det-name" id="det-cli-name" style="font-size:14px;font-weight:600;line-height:1.2;">Cliente</div>
              <div class="det-sub" id="det-cli-sub" style="font-size:10px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:0.5px;text-transform:uppercase;margin-top:2px;">cargando…</div>
            </div>
            <span class="chip" id="det-cli-status">—</span>
            <button class="notif-close" onclick="closeClienteDetail()">×</button>
          </div>
          <div class="det-tabs" style="display:flex;gap:0;border-bottom:1px solid var(--border);padding:0 20px;flex-shrink:0;">
            <div class="det-tab active" data-ctab="overview" onclick="cTabSwitch('overview')" style="padding:10px 16px;cursor:pointer;font-size:11px;color:var(--text);border-bottom:2px solid var(--accent);font-weight:500;margin-bottom:-1px;">Overview</div>
            <div class="det-tab" data-ctab="subs" onclick="cTabSwitch('subs')" style="padding:10px 16px;cursor:pointer;font-size:11px;color:var(--text3);border-bottom:2px solid transparent;margin-bottom:-1px;">Subscripción</div>
            <div class="det-tab" data-ctab="payments" onclick="cTabSwitch('payments')" style="padding:10px 16px;cursor:pointer;font-size:11px;color:var(--text3);border-bottom:2px solid transparent;margin-bottom:-1px;">Payments</div>
            <div class="det-tab" data-ctab="aria" onclick="cTabSwitch('aria')" style="padding:10px 16px;cursor:pointer;font-size:11px;color:var(--text3);border-bottom:2px solid transparent;margin-bottom:-1px;">ARIA</div>
            <div class="det-tab" data-ctab="timeline" onclick="cTabSwitch('timeline')" style="padding:10px 16px;cursor:pointer;font-size:11px;color:var(--text3);border-bottom:2px solid transparent;margin-bottom:-1px;">Timeline</div>
          </div>
          <div class="det-body" id="det-cli-body" style="flex:1;overflow-y:auto;padding:20px;">
            <div class="dim" style="text-align:center;padding:30px;font-size:11px;">Cargando…</div>
          </div>
          <div class="det-foot" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
            <button class="btn ghost" id="det-cli-suspend" style="font-size:11px;">Suspender</button>
            <button class="btn ghost" id="det-cli-stripe" style="font-size:11px;">Ver en Stripe ↗</button>
            <button class="btn primary" id="det-cli-close" onclick="closeClienteDetail()" style="font-size:11px;">Cerrar</button>
          </div>
        </div>
      </div>

      <!-- INVOICE DETAIL -->
      <div class="det-overlay" id="det-invoice-overlay" onclick="if(event.target.id==='det-invoice-overlay')closeInvoiceDetail()" style="display:none;position:fixed;inset:0;z-index:520;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;">
        <div class="det" style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:560px;max-width:94vw;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;">
          <div class="det-head" style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;flex-shrink:0;">
            <div class="det-avatar" style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,var(--card2),var(--card3));border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">$</div>
            <div style="flex:1;">
              <div class="det-name" id="det-inv-name" style="font-size:14px;font-weight:600;">INV-—</div>
              <div class="det-sub" id="det-inv-sub" style="font-size:10px;color:var(--text3);font-family:'Geist Mono',monospace;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">cargando…</div>
            </div>
            <span class="chip" id="det-inv-status">—</span>
            <button class="notif-close" onclick="closeInvoiceDetail()">×</button>
          </div>
          <div class="det-body" id="det-inv-body" style="flex:1;overflow-y:auto;padding:20px;">
            <div class="dim" style="text-align:center;padding:30px;font-size:11px;">Cargando…</div>
          </div>
          <div class="det-foot" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;flex-shrink:0;">
            <button class="btn ghost" id="det-inv-refund" style="font-size:11px;">Refund</button>
            <button class="btn ghost" id="det-inv-stripe" style="font-size:11px;">Ver en Stripe ↗</button>
            <button class="btn primary" onclick="closeInvoiceDetail()" style="font-size:11px;">Cerrar</button>
          </div>
        </div>
      </div>

      <!-- CONFIRM DIALOG -->
      <div class="confirm-overlay" id="confirm-overlay" style="display:none;position:fixed;inset:0;z-index:560;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;" onclick="if(event.target.id==='confirm-overlay')confirmCancel()">
        <div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:380px;max-width:92vw;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;">
            <div style="width:32px;height:32px;border-radius:8px;background:var(--danger-s);color:var(--danger);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;flex-shrink:0;">!</div>
            <div id="confirm-title" style="font-size:13px;font-weight:600;">¿Confirmar?</div>
          </div>
          <div id="confirm-body" style="padding:14px 20px;font-size:12px;color:var(--text2);line-height:1.55;">Esta acción es irreversible.</div>
          <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn ghost" onclick="confirmCancel()" style="font-size:11px;">Cancelar</button>
            <button class="btn" id="confirm-ok-btn" style="font-size:11px;background:var(--danger);color:#fff;border-color:var(--danger);">Confirmar</button>
          </div>
        </div>
      </div>
    `;
    while(el.firstElementChild) document.body.appendChild(el.firstElementChild);

    // overlays usan flex cuando .active
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .det-overlay.active{display:flex!important;}
      .confirm-overlay.active{display:flex!important;}
      .det-tab.active{color:var(--text)!important;border-bottom-color:var(--accent)!important;font-weight:500;}
    `;
    document.head.appendChild(styleEl);
  }

  // ─── Confirm dialog reusable ───
  let _confirmCb = null;
  // confirmDanger(title, body)                       → Promise<bool>  (recomendado)
  // confirmDanger(title, body, btnLabel)              → Promise<bool>  (con label custom)
  // confirmDanger(title, body, callback, btnLabel?)   → callback API (legacy)
  function confirmDanger(title, body, arg3, arg4){
    ensureDOM();
    let onConfirm = null, btnLabel = 'Confirmar';
    if(typeof arg3 === 'function'){ onConfirm = arg3; if(typeof arg4 === 'string') btnLabel = arg4; }
    else if(typeof arg3 === 'string') btnLabel = arg3;

    $('confirm-title').textContent = title;
    $('confirm-body').textContent  = body;
    $('confirm-ok-btn').textContent = btnLabel;
    $('confirm-overlay').classList.add('active');

    if(onConfirm){
      _confirmCb = onConfirm;
      _confirmResolve = null;
      return;
    }
    // Promise API
    return new Promise(resolve => {
      _confirmResolve = resolve;
      _confirmCb = () => { resolve(true); _confirmResolve = null; };
    });
  }
  function confirmCancel(){
    $('confirm-overlay')?.classList.remove('active');
    if(_confirmResolve){ _confirmResolve(false); _confirmResolve = null; }
    _confirmCb = null;
  }
  let _confirmResolve = null;
  // Wire one time on first ensureDOM
  document.addEventListener('click', (e) => {
    if(e.target?.id === 'confirm-ok-btn'){
      const cb = _confirmCb;
      _confirmCb = null; _confirmResolve = null;
      $('confirm-overlay')?.classList.remove('active');
      if(typeof cb === 'function') cb();
    }
  });
  // Alias `confirmAsync` para legibilidad (idéntico a confirmDanger sin callback)
  global.confirmAsync = confirmDanger;

  // ─── Cliente detail ───
  let _currentCliente = null;
  let _currentTab = 'overview';

  async function openClienteDetail(idOrEmail){
    ensureDOM();
    _currentTab = 'overview';
    document.querySelectorAll('.det-tab').forEach(t => t.classList.toggle('active', t.dataset.ctab === 'overview'));
    $('det-cliente-overlay').classList.add('active');
    $('det-cli-body').innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">Cargando…</div>`;
    try {
      // Resolver cliente por id o email
      let q = '';
      if(/^[0-9a-f-]{36}$/i.test(idOrEmail)) q = `id=eq.${idOrEmail}`;
      else q = `email=eq.${encodeURIComponent(idOrEmail)}`;
      const rows = await global.sbGet('clients', q + '&select=*&limit=1').catch(() => []);
      const cli = Array.isArray(rows) ? rows[0] : null;
      if(!cli){
        $('det-cli-body').innerHTML = `<div style="text-align:center;padding:30px;color:var(--danger);font-size:11px;">Cliente no encontrado</div>`;
        return;
      }
      _currentCliente = cli;
      // Header
      const initial = (cli.name || cli.email || '?').charAt(0).toUpperCase();
      $('det-cli-avatar').textContent = initial;
      $('det-cli-name').textContent = cli.name || cli.email || 'Cliente';
      const statusUpper = (cli.status || 'active').toUpperCase();
      const subParts = [
        (cli.plan || 'PRO').toUpperCase(),
        statusUpper,
        cli.timezone ? cli.timezone.split('/').pop().slice(0,12) : null,
      ].filter(Boolean);
      $('det-cli-sub').textContent = subParts.join(' · ');
      const chipEl = $('det-cli-status');
      chipEl.className = 'chip ' + (statusUpper === 'ACTIVE' ? 'ok' : statusUpper === 'TRIAL' ? 'warn' : 'danger');
      chipEl.innerHTML = `<span class="chip-dot"></span>${escape(statusUpper)}`;

      // Render tab
      renderClienteTab('overview');

      // Foot actions
      $('det-cli-suspend').onclick = () => {
        confirmDanger(
          `Suspender ${cli.name || cli.email}`,
          'Su acceso al panel se bloqueará. La subscripción Stripe NO se cancela automáticamente.',
          () => global.toast?.('Cliente suspendido (mock)', 'warn')
        );
      };
      $('det-cli-stripe').onclick = () => {
        if(cli.stripe_customer_id){
          global.electronAPI?.openExternal(`https://dashboard.stripe.com/customers/${encodeURIComponent(cli.stripe_customer_id)}`);
        } else {
          global.toast?.('Sin Stripe customer ID asociado', 'warn');
        }
      };
    } catch(err){
      $('det-cli-body').innerHTML = `<div style="text-align:center;padding:30px;color:var(--danger);font-size:11px;">Error: ${escape(err.message || 'desconocido')}</div>`;
    }
  }
  function closeClienteDetail(){ $('det-cliente-overlay')?.classList.remove('active'); }

  function cTabSwitch(tab){
    _currentTab = tab;
    document.querySelectorAll('.det-tab').forEach(t => t.classList.toggle('active', t.dataset.ctab === tab));
    renderClienteTab(tab);
  }

  async function renderClienteTab(tab){
    const body = $('det-cli-body');
    if(!body || !_currentCliente) return;
    const cli = _currentCliente;
    body.innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">Cargando…</div>`;

    if(tab === 'overview'){
      const created = fmtDate(cli.created_at);
      body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:18px;font-size:12px;">
          <div>
            <div class="dim" style="font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">CONTACTO</div>
            <div style="line-height:1.8;">
              <div><strong>Email:</strong> <span class="dim" style="font-family:'Geist Mono',monospace;font-size:11px;">${escape(cli.email || '—')}</span></div>
              <div><strong>WhatsApp:</strong> <span class="dim" style="font-family:'Geist Mono',monospace;font-size:11px;">${escape(cli.phone || '—')}</span></div>
              <div><strong>Timezone:</strong> ${escape(cli.timezone || 'auto')}</div>
              <div><strong>Activado:</strong> ${escape(created)}</div>
            </div>
          </div>
          <div>
            <div class="dim" style="font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">CONFIG</div>
            <div style="line-height:1.8;">
              <div><strong>Plan:</strong> ${escape((cli.plan || '—').toUpperCase())}</div>
              <div><strong>Estado:</strong> ${escape((cli.status || '—').toUpperCase())}</div>
              <div><strong>Stripe:</strong> <span class="dim" style="font-family:'Geist Mono',monospace;font-size:11px;">${escape(cli.stripe_customer_id || '—')}</span></div>
              <div><strong>App ver.:</strong> ${escape(cli.app_version || '—')}</div>
            </div>
          </div>
        </div>
      `;
    } else if(tab === 'subs'){
      try {
        const subs = await global.sbGet('subscriptions', `client_id=eq.${cli.id}&order=created_at.desc&select=*`).catch(()=>[]);
        if(!Array.isArray(subs) || !subs.length){
          body.innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">Sin subscripciones</div>`;
          return;
        }
        body.innerHTML = `<table class="tbl"><thead><tr><th>Periodo</th><th>Estado</th><th>Monto</th></tr></thead><tbody>${
          subs.map(s => `<tr>
            <td>${escape(fmtDate(s.current_period_start))} → ${escape(fmtDate(s.current_period_end))}</td>
            <td><span class="chip ${s.status === 'active' ? 'ok' : s.status === 'canceled' ? 'danger' : 'warn'}">${escape((s.status || '').toUpperCase())}</span></td>
            <td style="font-family:'Geist Mono',monospace;">${fmtMoney(s.amount)}</td>
          </tr>`).join('')
        }</tbody></table>`;
      } catch(err){
        body.innerHTML = `<div style="color:var(--danger);padding:14px;">Error: ${escape(err.message || '')}</div>`;
      }
    } else if(tab === 'payments'){
      try {
        const invs = await global.sbGet('invoices', `client_id=eq.${cli.id}&order=created_at.desc&limit=20&select=*`).catch(()=>[]);
        if(!Array.isArray(invs) || !invs.length){
          body.innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">Sin invoices</div>`;
          return;
        }
        body.innerHTML = `<table class="tbl"><thead><tr><th>Invoice</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr></thead><tbody>${
          invs.map(i => `<tr onclick="openInvoiceDetail('${escape(i.id)}')" style="cursor:pointer;">
            <td><strong>${escape(i.invoice_number || ('#' + String(i.id).slice(0,8)))}</strong></td>
            <td style="font-family:'Geist Mono',monospace;">${fmtMoney(i.amount)}</td>
            <td><span class="chip ${i.status === 'paid' ? 'ok' : i.status === 'failed' ? 'danger' : 'warn'}">${escape((i.status || '').toUpperCase())}</span></td>
            <td class="dim">${escape(fmtDate(i.created_at))}</td>
          </tr>`).join('')
        }</tbody></table>`;
      } catch(err){
        body.innerHTML = `<div style="color:var(--danger);padding:14px;">Error: ${escape(err.message || '')}</div>`;
      }
    } else if(tab === 'aria'){
      body.innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">ARIA history requiere RLS extra desde madre · pendiente Fase 2</div>`;
    } else if(tab === 'timeline'){
      // Timeline simple: combina invoices + subs en orden cronológico
      try {
        const [invs, subs] = await Promise.all([
          global.sbGet('invoices', `client_id=eq.${cli.id}&order=created_at.desc&limit=10&select=*`).catch(()=>[]),
          global.sbGet('subscriptions', `client_id=eq.${cli.id}&order=created_at.desc&select=*`).catch(()=>[]),
        ]);
        const events = [];
        (invs || []).forEach(i => events.push({
          ts: i.created_at, kind: i.status === 'paid' ? 'ok' : i.status === 'failed' ? 'danger' : 'warn',
          text: `<strong>Invoice ${escape(i.invoice_number || '#'+String(i.id).slice(0,8))}</strong> · ${escape((i.status||'').toUpperCase())} · ${fmtMoney(i.amount)}`
        }));
        (subs || []).forEach(s => events.push({
          ts: s.created_at, kind: s.status === 'active' ? 'ok' : 'warn',
          text: `<strong>Subscripción ${escape((s.status||'').toUpperCase())}</strong>`
        }));
        events.push({ ts: cli.created_at, kind: 'ok', text: '<strong>Cliente activado</strong>' });
        events.sort((a,b) => new Date(b.ts) - new Date(a.ts));
        if(!events.length){
          body.innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">Sin eventos</div>`;
          return;
        }
        body.innerHTML = events.map(e => `
          <div style="display:flex;gap:14px;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="width:14px;height:14px;border-radius:50%;background:var(--card2);border:2px solid var(${e.kind === 'ok' ? '--success' : e.kind === 'warn' ? '--warn' : '--danger'});flex-shrink:0;margin-top:3px;"></div>
            <div style="flex:1;font-size:11px;line-height:1.5;">${e.text}<div class="dim" style="font-size:9px;font-family:'Geist Mono',monospace;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;">${escape(fmtDate(e.ts))}</div></div>
          </div>
        `).join('');
      } catch(err){
        body.innerHTML = `<div style="color:var(--danger);padding:14px;">Error: ${escape(err.message || '')}</div>`;
      }
    }
  }

  // ─── Invoice detail ───
  async function openInvoiceDetail(id){
    ensureDOM();
    $('det-invoice-overlay').classList.add('active');
    const body = $('det-inv-body');
    body.innerHTML = `<div class="dim" style="text-align:center;padding:30px;font-size:11px;">Cargando…</div>`;
    try {
      const rows = await global.sbGet('invoices', `id=eq.${id}&select=*&limit=1`).catch(() => []);
      const inv = Array.isArray(rows) ? rows[0] : null;
      if(!inv){
        body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--danger);font-size:11px;">Invoice no encontrada</div>`;
        return;
      }
      $('det-inv-name').textContent = inv.invoice_number || '#' + String(inv.id).slice(0,8);
      $('det-inv-sub').textContent  = `${escape(inv.client_name || inv.client_id || '—')} · ${escape((inv.method || 'STRIPE').toUpperCase())} · ${escape(fmtDate(inv.created_at))}`;
      const chipEl = $('det-inv-status');
      const statusUp = (inv.status || '').toUpperCase();
      chipEl.className = 'chip ' + (inv.status === 'paid' ? 'ok' : inv.status === 'failed' ? 'danger' : 'warn');
      chipEl.textContent = statusUp;

      body.innerHTML = `
        <table class="tbl" style="margin-bottom:14px;">
          <thead><tr><th>Concepto</th><th style="text-align:right;">Subtotal</th></tr></thead>
          <tbody>
            <tr><td>${escape(inv.description || 'Suscripción Pro')}</td><td style="text-align:right;font-family:'Geist Mono',monospace;">${fmtMoney(inv.amount)}</td></tr>
            ${inv.discount_amount > 0 ? `<tr><td>Discount ${inv.discount_code ? '<span class="chip" style="margin-left:6px;">'+escape(inv.discount_code)+'</span>' : ''}</td><td style="text-align:right;font-family:'Geist Mono',monospace;color:var(--success);">-${fmtMoney(inv.discount_amount)}</td></tr>` : ''}
            <tr><td><strong>TOTAL</strong></td><td style="text-align:right;font-family:'Geist Mono',monospace;font-weight:700;font-size:13px;">${fmtMoney(inv.amount - (inv.discount_amount||0))}</td></tr>
          </tbody>
        </table>
        <div style="font-size:11px;line-height:1.8;">
          <div class="dim" style="font-size:9px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">PAYMENT INTENT</div>
          <div><strong>ID:</strong> <span class="dim" style="font-family:'Geist Mono',monospace;">${escape(inv.stripe_payment_intent_id || '—')}</span></div>
          <div><strong>Método:</strong> ${escape(inv.method || '—')}</div>
          <div><strong>Captured:</strong> ${escape(fmtDate(inv.paid_at || inv.created_at))}</div>
        </div>
      `;

      $('det-inv-refund').onclick = () => {
        if(inv.status !== 'paid'){ global.toast?.('Solo invoices PAID se pueden reembolsar', 'warn'); return; }
        confirmDanger(
          `Reembolsar ${inv.invoice_number || '#'+String(inv.id).slice(0,8)}`,
          `Stripe procesará el refund de ${fmtMoney(inv.amount)} en 5-10 días hábiles. La subscripción NO se cancela.`,
          () => global.toast?.('Refund iniciado en Stripe (mock)', 'success')
        );
      };
      $('det-inv-stripe').onclick = () => {
        if(inv.stripe_invoice_id){
          global.electronAPI?.openExternal(`https://dashboard.stripe.com/invoices/${encodeURIComponent(inv.stripe_invoice_id)}`);
        } else {
          global.toast?.('Sin Stripe invoice ID asociado', 'warn');
        }
      };
    } catch(err){
      body.innerHTML = `<div style="text-align:center;padding:30px;color:var(--danger);font-size:11px;">Error: ${escape(err.message || '')}</div>`;
    }
  }
  function closeInvoiceDetail(){ $('det-invoice-overlay')?.classList.remove('active'); }

  // ─── ESC closes ───
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape'){
      closeClienteDetail();
      closeInvoiceDetail();
      confirmCancel();
    }
  });

  // ─── API pública ───
  // v1.0.37 hotfix · Eliminadas las exposiciones de openClienteDetail/closeClienteDetail
  // porque chocaban con cliente-detail.js (componente nuevo · 6 tabs). El modal viejo
  // (5 tabs · datos vacíos) sobreescribía al nuevo según orden de carga. Ahora
  // cliente-detail.js es la única fuente de window.openClienteDetail.
  // Mantenemos invoice + confirm que sí son usados por el resto del código.
  global.openInvoiceDetail = openInvoiceDetail;
  global.closeInvoiceDetail = closeInvoiceDetail;
  global.cTabSwitch = cTabSwitch;
  global.confirmDanger = confirmDanger;
  global.confirmCancel = confirmCancel;
})(window);
