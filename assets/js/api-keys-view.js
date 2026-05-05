// ============================================
// Dominio Madre · Vista API & Keys (Fase 3)
// ============================================
// CRUD de api_keys con pattern "show plain-text once".
// Usa fn_create_api_key() + fn_revoke_api_key() de Postgres.
(function(global){
  'use strict';

  const ApiKeysView = {
    _keys: [],
    _clients: [],

    async render(){
      const view = document.querySelector('.view[data-view="keys"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">API &amp; Keys</div><div class="page-sub" id="ak-sub">PLATAFORMA · CARGANDO…</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="ak-refresh">↻ Refrescar</button>
            <button class="btn primary" id="ak-new">+ Generar key</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">ACTIVAS</div><div class="kpi-value" id="ak-active">—</div><div class="kpi-trend up">en uso</div></div>
          <div class="kpi-card"><div class="kpi-label">REVOCADAS</div><div class="kpi-value" id="ak-revoked">—</div><div class="kpi-trend">históricas</div></div>
          <div class="kpi-card"><div class="kpi-label">EXPIRADAS</div><div class="kpi-value" id="ak-expired" style="color:var(--warn);">—</div><div class="kpi-trend down">vencidas</div></div>
          <div class="kpi-card"><div class="kpi-label">USADAS 7D</div><div class="kpi-value" id="ak-recent">—</div><div class="kpi-trend">último uso</div></div>
        </div>

        <div class="panel" style="margin-top:12px;">
          <div class="panel-head"><div class="panel-title">Keys del sistema</div><div class="panel-sub" id="ak-count">—</div></div>
          <table class="tbl">
            <thead>
              <tr><th class="sortable">Nombre</th><th class="sortable">Provider</th><th class="sortable">Hint</th><th class="sortable">Scopes</th><th class="sortable">Env</th><th class="sortable">Status</th><th class="sortable">Uso</th><th class="sortable">Creada</th><th class="sortable">Expira</th><th style="text-align:right;">Acciones</th></tr>
            </thead>
            <tbody id="ak-tbody"><tr><td colspan="10" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>
      `;

      document.getElementById('ak-refresh').onclick = () => this.load();
      document.getElementById('ak-new').onclick = () => this.openCreateModal();
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('ak-new'), 'api_keys:write');
      await this.load();
    },

    async load(){
      try {
        document.getElementById('ak-sub').textContent = 'PLATAFORMA · CARGANDO…';
        const [keys, clients] = await Promise.all([
          global.sbGet('v_api_keys_safe', 'select=*&order=created_at.desc'),
          global.sbGet('clients', 'select=id,empresa,nombre&status=eq.activo&order=empresa').catch(()=>[])
        ]);
        this._keys = keys || [];
        this._clients = clients || [];
        this.renderKPIs();
        this.renderTable();
        document.getElementById('ak-sub').textContent = `PLATAFORMA · ${this._keys.length} KEYS`;
      } catch(err){
        document.getElementById('ak-sub').textContent = 'ERROR · ' + err.message;
        document.getElementById('ak-tbody').innerHTML = `<tr><td colspan="10" class="dim" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(err.message)}</td></tr>`;
      }
    },

    renderKPIs(){
      const k = this._keys;
      document.getElementById('ak-active').textContent  = k.filter(x => x.status === 'active' && x.health !== 'expired').length;
      document.getElementById('ak-revoked').textContent = k.filter(x => x.status === 'revoked').length;
      document.getElementById('ak-expired').textContent = k.filter(x => x.health === 'expired').length;
      document.getElementById('ak-recent').textContent  = k.filter(x => x.health === 'active').length;
    },

    renderTable(){
      const tbody = document.getElementById('ak-tbody');
      document.getElementById('ak-count').textContent = `${this._keys.length} keys`;

      if(this._keys.length === 0){
        tbody.innerHTML = `<tr><td colspan="10" class="dim" style="text-align:center;padding:30px;">
          <div style="font-size:13px;margin-bottom:6px;">Sin API keys aún.</div>
          <div style="font-size:11px;">Genera la primera para integraciones externas o SDKs.</div>
        </td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('api_keys:write');
      tbody.innerHTML = this._keys.map(k => {
        const statusChip = k.status === 'revoked'
          ? '<span class="chip chip-off">REVOKED</span>'
          : k.health === 'expired'
            ? '<span class="chip chip-err">EXPIRED</span>'
            : k.health === 'active'
              ? '<span class="chip chip-ok"><span class="chip-dot"></span>ACTIVE</span>'
              : k.health === 'idle'
                ? '<span class="chip chip-warn">IDLE</span>'
                : k.health === 'unused'
                  ? '<span class="chip chip-off">UNUSED</span>'
                  : '<span class="chip chip-warn">STALE</span>';

        const scopesChips = (k.scopes||[]).slice(0,3).map(s => `<span style="font-size:8px;padding:1px 5px;background:var(--card2);border:1px solid var(--border);border-radius:3px;font-family:'Geist Mono',monospace;margin-right:3px;">${escapeHtml(s)}</span>`).join('');

        const actions = [];
        if(canWrite && k.status !== 'revoked'){
          actions.push(`<button class="icon-btn" title="Revocar" onclick="ApiKeysView.revoke('${k.id}')" style="color:var(--danger);">Ø</button>`);
        }
        actions.push(`<button class="icon-btn" title="Detalles" onclick="ApiKeysView.showDetails('${k.id}')">…</button>`);

        return `
          <tr>
            <td><strong>${escapeHtml(k.name)}</strong>${k.description ? `<div class="dim" style="font-size:10px;">${escapeHtml(k.description)}</div>` : ''}${k.client_empresa ? `<div class="dim" style="font-size:10px;">cliente: ${escapeHtml(k.client_empresa)}</div>` : ''}</td>
            <td class="dim">${escapeHtml(k.provider)}</td>
            <td class="mono" style="font-size:10px;color:var(--text2);">…${escapeHtml(k.key_hint || '')}</td>
            <td>${scopesChips}${(k.scopes||[]).length > 3 ? `<span class="dim" style="font-size:9px;">+${(k.scopes||[]).length - 3}</span>` : ''}</td>
            <td><span class="chip chip-off">${escapeHtml((k.environment||'prod').toUpperCase().slice(0,4))}</span></td>
            <td>${statusChip}</td>
            <td class="num">${k.usage_count || 0}</td>
            <td class="num dim"><span data-ts="${escapeHtml(k.created_at)}">${relativeTime(k.created_at)}</span></td>
            <td class="num dim">${k.expires_at ? `<span data-ts="${escapeHtml(k.expires_at)}">${relativeTime(k.expires_at)}</span>` : '—'}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>`;
      }).join('');
    },

    openCreateModal(){
      if(!global.RBAC?.can('api_keys:write')){ global.toast?.('Sin permiso', 'err'); return; }

      const clientOpts = '<option value="">Key global (sin cliente)</option>' +
        this._clients.map(c => `<option value="${c.id}">${escapeHtml(c.empresa || c.nombre)}</option>`).join('');

      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">Generar API key</div>
          <button id="akc-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">NOMBRE</div>
            <input id="akc-name" type="text" placeholder="Ej: Integración Zapier" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PROVIDER</div>
            <select id="akc-provider" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="custom">Custom (SDK propio)</option>
              <option value="stripe">Stripe</option><option value="meta">Meta</option><option value="google">Google</option>
              <option value="whatsapp">WhatsApp</option><option value="n8n">n8n</option><option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option><option value="resend">Resend</option><option value="twilio">Twilio</option>
            </select></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">ENVIRONMENT</div>
            <select id="akc-env" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="production">Production</option><option value="staging">Staging</option><option value="test">Test</option><option value="development">Development</option>
            </select></div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">CLIENTE (opcional)</div>
            <select id="akc-client" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">${clientOpts}</select>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">SCOPES (separados por coma)</div>
            <input id="akc-scopes" type="text" placeholder="leads:read, appointments:rw" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">EXPIRA</div>
            <input id="akc-expires" type="date" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">RATE LIMIT/MIN</div>
            <input id="akc-rate" type="number" min="0" placeholder="(sin límite)" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;"></div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">DESCRIPCIÓN</div>
            <textarea id="akc-desc" placeholder="Para qué se usa esta key…" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;min-height:50px;"></textarea>
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="akc-cancel">Cancelar</button>
          <button class="btn primary" id="akc-save">Generar</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">${body}</div>`;
      document.body.appendChild(wrap);

      const close = () => wrap.remove();
      wrap.querySelector('#akc-close').onclick = close;
      wrap.querySelector('#akc-cancel').onclick = close;
      wrap.querySelector('#akc-save').onclick = async () => {
        const name = wrap.querySelector('#akc-name').value.trim();
        const provider = wrap.querySelector('#akc-provider').value;
        const env = wrap.querySelector('#akc-env').value;
        const clientId = wrap.querySelector('#akc-client').value || null;
        const scopesStr = wrap.querySelector('#akc-scopes').value.trim();
        const expires = wrap.querySelector('#akc-expires').value;
        const rate = parseInt(wrap.querySelector('#akc-rate').value) || null;
        const desc = wrap.querySelector('#akc-desc').value.trim();

        if(!name){ global.toast?.('Nombre requerido', 'err'); return; }
        const scopes = scopesStr ? scopesStr.split(',').map(s => s.trim()).filter(Boolean) : [];

        try {
          const r = await fetch(`${global.SUPABASE_URL}/rest/v1/rpc/fn_create_api_key`, {
            method: 'POST',
            headers: { ...global.sbHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              p_name: name,
              p_provider: provider,
              p_scopes: scopes,
              p_environment: env,
              p_client_id: clientId,
              p_expires_at: expires ? new Date(expires).toISOString() : null,
              p_rate_limit_per_min: rate,
              p_ip_whitelist: null,
              p_tags: [],
              p_description: desc || null
            })
          });
          if(!r.ok){ const e = await r.text(); throw new Error(e); }
          const result = await r.json();
          close();
          this.showKeyOnce(result);
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    showKeyOnce(result){
      // Result: { id, plain_key, hint, warning }
      const body = `
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);">
          <div style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px;">⚠ Guarda esta key AHORA</div>
        </div>
        <div style="padding:16px 20px;">
          <div style="padding:10px;background:var(--warn-s);border:1px solid rgba(242,201,76,0.2);border-radius:5px;font-size:11px;color:var(--warn);margin-bottom:14px;">
            Esta key se muestra <strong>una sola vez</strong>. Al cerrar este diálogo no podrás recuperarla. Guárdala en un gestor de contraseñas o Vault.
          </div>
          <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PLAIN KEY</div>
          <div style="display:flex;gap:6px;margin-bottom:12px;">
            <code id="aks-key" style="flex:1;padding:10px 12px;background:var(--card2);border:1px solid var(--border);border-radius:5px;font-size:12px;word-break:break-all;">${escapeHtml(result.plain_key)}</code>
            <button class="btn ghost" id="aks-copy" style="flex-shrink:0;">Copiar</button>
          </div>
          <div style="font-size:11px;color:var(--text2);line-height:1.6;">
            <strong>Key hint:</strong> <code style="background:var(--card2);padding:2px 6px;border-radius:3px;">…${escapeHtml(result.hint)}</code><br>
            <strong>ID:</strong> <code style="background:var(--card2);padding:2px 6px;border-radius:3px;font-size:10px;">${escapeHtml(result.id)}</code>
          </div>
        </div>
        <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn primary" id="aks-close">Ya la guardé, cerrar</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:900;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--warn);border-radius:10px;width:100%;max-width:520px;">${body}</div>`;
      document.body.appendChild(wrap);
      wrap.querySelector('#aks-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(result.plain_key); global.toast?.('Key copiada', 'success'); }
        catch(e){ prompt('Copia manualmente:', result.plain_key); }
      };
      wrap.querySelector('#aks-close').onclick = () => {
        if(confirm('¿Ya copiaste la key? Una vez que cierres no podrás verla de nuevo.')) wrap.remove();
      };
    },

    async revoke(id){
      if(!(await confirmDanger('Revocar API key', 'La key dejará de funcionar inmediatamente. Servicios que dependan de ella van a fallar. No se puede revertir.', 'Revocar'))) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/rest/v1/rpc/fn_revoke_api_key`, {
          method: 'POST',
          headers: { ...global.sbHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_key_id: id })
        });
        if(!r.ok) throw new Error(await r.text());
        global.toast?.('Key revocada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    showDetails(id){
      const k = this._keys.find(x => x.id === id);
      if(!k) return;
      const rows = [
        ['ID', k.id], ['Nombre', k.name], ['Provider', k.provider], ['Env', k.environment],
        ['Status', k.status], ['Health', k.health], ['Hint', '…' + (k.key_hint||'')],
        ['Scopes', (k.scopes||[]).join(', ') || '—'],
        ['Tags', (k.tags||[]).join(', ') || '—'],
        ['Descripción', k.description || '—'],
        ['Cliente', k.client_empresa || k.client_nombre || '—'],
        ['Rate limit', k.rate_limit_per_min ? `${k.rate_limit_per_min}/min` : 'sin límite'],
        ['IP whitelist', (k.ip_whitelist||[]).join(', ') || '—'],
        ['Usage count', k.usage_count || 0],
        ['Último uso', k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'nunca'],
        ['Creada', new Date(k.created_at).toLocaleString()],
        ['Expira', k.expires_at ? new Date(k.expires_at).toLocaleString() : 'nunca'],
        ['Revocada', k.revoked_at ? new Date(k.revoked_at).toLocaleString() : '—']
      ].map(([label,val]) => `<div style="display:flex;padding:5px 0;border-bottom:1px dashed var(--border);"><div class="dim" style="flex:0 0 140px;font-size:10px;font-family:'Geist Mono',monospace;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(label)}</div><div style="font-size:12px;flex:1;">${escapeHtml(val===null||val===undefined?'—':val)}</div></div>`).join('');

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;">
          <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
            <div style="font-size:14px;font-weight:600;">Detalles API key</div>
            <button id="aked-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
          </div>
          <div style="padding:14px 18px;">${rows}</div>
        </div>
      `;
      document.body.appendChild(wrap);
      wrap.querySelector('#aked-close').onclick = () => wrap.remove();
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.ApiKeysView = ApiKeysView;
})(window);
