// ============================================
// Dominio Madre · Onboard Cliente Wizard (v1.0.34)
// ============================================
// Modal completo para crear cliente nuevo Pro/Enterprise:
//   1. Datos cliente (empresa, contacto, email, whatsapp, país, industria)
//   2. Plan + facturación (plan, monto, moneda, interval)
//   3. Método de pago (manual hoy · Stripe post-LLC)
//
// Llama Edge Function /functions/v1/client-onboard que:
//   · Crea Supabase Auth user + clients + subscriptions
//   · Envía email bienvenida con creds + DMG link
//
// Uso: window.openClientOnboard()
// ============================================

(function(global){
  'use strict';

  const escapeHtml = global.escapeHtml || ((s) => String(s||''));

  const PAISES = ['México','Estados Unidos','República Dominicana','Argentina','Colombia','Chile','Perú','España','Otro'];
  const INDUSTRIAS = ['clinica_estetica','clinica_dental','spa','barberia','salon_belleza','medicina_general','fisioterapia','psicologia','nutricion','veterinaria','otro'];
  const PLANES = [
    { id: 'pro',        label: 'Pro',        amount_default: 9900,  desc: '$99/mes · ARIA + WhatsApp + Reportes' },
    { id: 'enterprise', label: 'Enterprise', amount_default: 49900, desc: '$499/mes · Todo Pro + multi-local + API' },
  ];
  const MONEDAS = ['USD','MXN','DOP','EUR','COP','ARS','CLP','PEN'];
  const METODOS = [
    { id: 'transferencia', label: 'Transferencia bancaria' },
    { id: 'paypal',        label: 'PayPal' },
    { id: 'wise',          label: 'Wise' },
    { id: 'mercadopago',   label: 'Mercado Pago' },
    { id: 'zelle',         label: 'Zelle' },
    { id: 'stripe',        label: 'Stripe (post-LLC)' },
    { id: 'manual',        label: 'Otro / Manual' },
  ];

  function open(){
    if(!global.RBAC?.can('clients:write') && !global.RBAC?.can('*')){
      global.toast?.('Sin permiso para crear clientes', 'err');
      return;
    }

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;';
    wrap.innerHTML = `
      <div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:680px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
        <div style="padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div>
            <div style="font-size:14px;font-weight:600;">Nuevo cliente</div>
            <div class="dim" style="font-size:11px;margin-top:2px;">Crea cuenta + envía email de bienvenida con credenciales</div>
          </div>
          <button id="cob-close" style="margin-left:auto;width:30px;height:30px;background:transparent;border:0;color:var(--text3);cursor:pointer;font-size:16px;">✕</button>
        </div>

        <div style="flex:1;overflow-y:auto;padding:20px;">
          <!-- ─── 1. Datos cliente ─── -->
          <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Datos del cliente</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">EMPRESA *</div>
              <input id="cob-empresa" type="text" required style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;"></div>
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">CONTACTO (NOMBRE) *</div>
              <input id="cob-nombre" type="text" required style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">EMAIL *</div>
              <input id="cob-email" type="email" required placeholder="cliente@empresa.com" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;outline:none;"></div>
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">WHATSAPP</div>
              <input id="cob-whatsapp" type="tel" placeholder="+52 999 ..." style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;outline:none;"></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">PAÍS</div>
              <select id="cob-pais" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
                ${PAISES.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')}
              </select></div>
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">VERTICAL</div>
              <select id="cob-vertical" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
                ${INDUSTRIAS.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v.replace(/_/g,' '))}</option>`).join('')}
              </select></div>
          </div>

          <!-- ─── 2. Plan + facturación ─── -->
          <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Plan y facturación</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            ${PLANES.map(p => `
              <label style="cursor:pointer;padding:14px;background:var(--card2);border:2px solid var(--border);border-radius:6px;display:block;" data-plan-card="${p.id}">
                <input type="radio" name="cob-plan" value="${p.id}" ${p.id==='pro'?'checked':''} style="margin-right:6px;">
                <strong style="font-size:13px;">${p.label}</strong>
                <div class="dim" style="font-size:10px;margin-top:4px;">${escapeHtml(p.desc)}</div>
              </label>
            `).join('')}
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:18px;">
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">MONTO *</div>
              <input id="cob-amount" type="number" step="0.01" min="0" value="99" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;outline:none;"></div>
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">MONEDA</div>
              <select id="cob-currency" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
                ${MONEDAS.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select></div>
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">INTERVALO</div>
              <select id="cob-interval" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
                <option value="month">Mensual</option><option value="year">Anual</option>
              </select></div>
          </div>

          <!-- ─── 3. Método de pago ─── -->
          <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:10px;">Pago</div>
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;">
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">MÉTODO</div>
              <select id="cob-payment-method" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
                ${METODOS.map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join('')}
              </select></div>
            <div><div class="field-label" style="font-size:10px;color:var(--text3);margin-bottom:4px;">REFERENCIA (opcional)</div>
              <input id="cob-payment-ref" type="text" placeholder="Ej: ID transferencia, email PayPal" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;outline:none;"></div>
          </div>
        </div>

        <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;align-items:center;">
          <div class="dim" id="cob-status" style="margin-right:auto;font-size:10px;font-family:'Geist Mono',monospace;"></div>
          <button class="btn ghost" id="cob-cancel">Cancelar</button>
          <button class="btn primary" id="cob-submit" style="background:var(--success);border-color:var(--success);color:#000;">✓ Crear y enviar bienvenida</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const close = () => wrap.remove();
    wrap.querySelector('#cob-close').onclick = close;
    wrap.querySelector('#cob-cancel').onclick = close;
    wrap.addEventListener('click', (e) => { if(e.target === wrap) close(); });

    // Plan radio · highlight visual
    wrap.querySelectorAll('input[name="cob-plan"]').forEach(r => {
      r.addEventListener('change', () => {
        wrap.querySelectorAll('[data-plan-card]').forEach(c => {
          const checked = c.querySelector('input').checked;
          c.style.borderColor = checked ? 'var(--success)' : 'var(--border)';
        });
        // Auto-fill monto sugerido
        const plan = PLANES.find(p => p.id === r.value);
        if(plan && wrap.querySelector('#cob-amount')) {
          wrap.querySelector('#cob-amount').value = (plan.amount_default / 100).toFixed(2);
        }
      });
    });
    // Trigger inicial
    wrap.querySelector('[data-plan-card="pro"]').style.borderColor = 'var(--success)';

    wrap.querySelector('#cob-submit').onclick = () => submit(wrap, close);
  }

  async function submit(wrap, close){
    const get = (id) => wrap.querySelector(id)?.value?.trim();
    const empresa = get('#cob-empresa');
    const nombre  = get('#cob-nombre');
    const email   = (get('#cob-email') || '').toLowerCase();
    const whatsapp = get('#cob-whatsapp');
    const pais     = get('#cob-pais');
    const vertical = get('#cob-vertical');
    const plan     = wrap.querySelector('input[name="cob-plan"]:checked')?.value || 'pro';
    const amount = parseFloat(get('#cob-amount'));
    const currency = get('#cob-currency') || 'usd';
    const interval = get('#cob-interval') || 'month';
    const payment_method = get('#cob-payment-method') || 'manual';
    const payment_reference = get('#cob-payment-ref');

    // Validaciones client-side
    if(!empresa || empresa.length < 2)             { global.toast?.('Empresa requerida', 'err'); return; }
    if(!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { global.toast?.('Email inválido', 'err'); return; }
    if(!amount || amount <= 0)                      { global.toast?.('Monto inválido', 'err'); return; }
    if(!confirm(`¿Crear cliente "${empresa}" con email ${email}?\n\nSe enviará email de bienvenida con credenciales temporales.`)) return;

    const submitBtn = wrap.querySelector('#cob-submit');
    const statusEl = wrap.querySelector('#cob-status');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando…';
    statusEl.textContent = 'Llamando Edge Function…';

    try {
      const token = global.SESSION?.accessToken || global.SUPABASE_ANON;
      const r = await fetch(`${global.SUPABASE_URL}/functions/v1/client-onboard`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'apikey': global.SUPABASE_ANON,
        },
        body: JSON.stringify({
          empresa, nombre, email, whatsapp, pais, vertical,
          plan,
          amount_cents: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          interval,
          payment_method,
          payment_reference,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if(!r.ok || !data.success){
        throw new Error(data.error || `HTTP ${r.status}`);
      }
      // Success · mostrar credenciales por si email falló
      close();
      showSuccess(data);
      // Refresh client list
      global.MadreClientsList?.load?.();
    } catch(err){
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Crear y enviar bienvenida';
      statusEl.textContent = '';
      global.toast?.('Error: ' + (err.message || 'falló'), 'err');
    }
  }

  function showSuccess(data){
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:910;display:flex;align-items:center;justify-content:center;padding:20px;';
    wrap.innerHTML = `
      <div style="background:var(--card);border:1px solid var(--success);border-radius:10px;width:100%;max-width:520px;">
        <div style="padding:24px 24px 14px;text-align:center;">
          <div style="width:48px;height:48px;border-radius:50%;background:rgba(111,207,151,0.15);color:var(--success);display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:12px;">✓</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Cliente creado</div>
          <div class="dim" style="font-size:12px;">${data.email_sent ? 'Email de bienvenida enviado a ' + escapeHtml(data.email) : '⚠ Email NO enviado · guarda las credenciales abajo'}</div>
        </div>
        <div style="padding:0 24px 18px;">
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:14px;font-size:12px;">
            <div style="font-size:10px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Credenciales</div>
            <div style="display:grid;grid-template-columns:80px 1fr;gap:8px 12px;">
              <div class="dim">Email</div>
              <div style="font-family:'Geist Mono',monospace;">${escapeHtml(data.email)}</div>
              <div class="dim">Password</div>
              <div style="font-family:'Geist Mono',monospace;letter-spacing:1px;background:var(--card3);padding:4px 8px;border-radius:4px;display:inline-block;width:fit-content;">${escapeHtml(data.temp_password || '')}</div>
              <div class="dim">Client ID</div>
              <div style="font-family:'Geist Mono',monospace;font-size:10px;">${escapeHtml(data.client_id || '')}</div>
            </div>
            <button class="btn ghost" style="margin-top:10px;width:100%;font-size:11px;" id="cs-copy">📋 Copiar credenciales</button>
          </div>
          ${data.email_sent ? '' : `<div style="background:rgba(235,87,87,0.1);border:1px solid rgba(235,87,87,0.3);border-radius:6px;padding:12px;font-size:11px;color:var(--danger);margin-top:12px;line-height:1.5;">⚠ El email no se envió. Guarda estas credenciales y mándalas tú al cliente. Error: ${escapeHtml(JSON.stringify(data.email_error || {}).slice(0,200))}</div>`}
        </div>
        <div style="padding:14px 24px;border-top:1px solid var(--border);text-align:right;">
          <button class="btn primary" id="cs-done">Listo</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.querySelector('#cs-done').onclick = () => wrap.remove();
    wrap.querySelector('#cs-copy').onclick = () => {
      const text = `Email: ${data.email}\nPassword: ${data.temp_password}\nClient ID: ${data.client_id}\nLogin: https://dominiosystem.com/downloads/client-app`;
      navigator.clipboard.writeText(text).then(() => global.toast?.('✓ Credenciales copiadas', 'success'));
    };
  }

  global.openClientOnboard = open;
})(window);
