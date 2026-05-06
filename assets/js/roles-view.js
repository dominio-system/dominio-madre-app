// ============================================
// Dominio Madre · Vista Roles & Permisos
// ============================================
// Matriz: rows = roles, columns = scopes agrupados por recurso.
// Owner puede crear/editar roles custom (is_system=false).
// Sistema roles (owner/admin/analyst/viewer) son read-only.

(function(global){
  'use strict';

  // Catálogo de recursos + acciones disponibles (UI).
  // La fuente de verdad son los scopes que guarda cada role en user_roles.scopes.
  // v1.0.17 · sincronizado con vistas reales del sidebar (visibles + ocultas).
  // Recursos marcados con `hidden:true` corresponden a vistas ocultas hoy del sidebar
  // (handlers vivos · accesibles via go() o ⌘K) · permisos siguen vivos para cuando
  // se reactiven en el sidebar.
  const RESOURCES = [
    // ── Negocio ──
    { key: 'revenue',       label: 'Ingresos & MRR', actions: ['read'],            group: 'Negocio' },
    { key: 'invoices',      label: 'Facturas',       actions: ['read','rw','*'],   group: 'Negocio' },
    { key: 'subs',          label: 'Suscripciones',  actions: ['read','rw','*'],   group: 'Negocio' },
    { key: 'dunning',       label: 'Cobranza',       actions: ['read','rw','*'],   group: 'Negocio' },
    { key: 'payouts',       label: 'Liquidaciones',  actions: ['read','rw','*'],   group: 'Negocio' },
    { key: 'billing',       label: 'Facturación (general)', actions: ['read','rw','*'], group: 'Negocio' },
    // ── Operación ──
    { key: 'clients',       label: 'Clientes',       actions: ['read','write','*'],group: 'Operación' },
    { key: 'leads',         label: 'Leads',          actions: ['read','rw','*'],   group: 'Operación' },
    { key: 'appointments',  label: 'Citas',          actions: ['read','rw','*'],   group: 'Operación' },
    { key: 'funnel',        label: 'Embudo',         actions: ['read'],            group: 'Operación' },
    // ── Sistema ──
    { key: 'status',        label: 'Estado del Sistema', actions: ['read'],        group: 'Sistema' },
    { key: 'incidents',     label: 'Incidencias',    actions: ['read','rw','*'],   group: 'Sistema' },
    { key: 'audit',         label: 'Auditoría',      actions: ['read'],            group: 'Sistema', hidden: true },
    // ── Soporte ──
    { key: 'tickets',       label: 'Tickets',        actions: ['read','rw','*'],   group: 'Soporte' },
    { key: 'reports',       label: 'Reportes',       actions: ['read','rw','*'],   group: 'Soporte' },
    // ── Plataforma ──
    { key: 'integrations',  label: 'Integraciones',  actions: ['read','rw','*'],   group: 'Plataforma' },
    { key: 'webhooks',      label: 'Webhooks',       actions: ['read','rw','*'],   group: 'Plataforma', hidden: true },
    { key: 'api_keys',      label: 'Llaves API',     actions: ['read','rw','*'],   group: 'Plataforma', hidden: true },
    // ── Equipo ──
    { key: 'users',         label: 'Usuarios',       actions: ['read','rw','*'],   group: 'Equipo' },
    // ── ARIA ──
    { key: 'ia_suggestions',label: 'ARIA / IA',      actions: ['read','rw'],       group: 'ARIA' },
  ];

  const RolesView = {
    _roles: [],

    async render(){
      const view = document.querySelector('.view[data-view="roles"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div>
            <div class="page-title">Roles &amp; Permisos</div>
            <div class="page-sub" id="rv-sub">ORGANIZACIÓN · CARGANDO…</div>
          </div>
          <div class="page-actions">
            <button class="btn ghost" id="rv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="rv-new" style="display:none;">+ Nuevo role</button>
          </div>
        </div>

        <div class="panel" style="margin-bottom:12px;">
          <div class="panel-head">
            <div class="panel-title">Matriz de permisos</div>
            <div class="panel-sub" id="rv-count">—</div>
          </div>
          <div style="overflow-x:auto;">
            <table class="tbl" id="rv-matrix"><thead></thead><tbody></tbody></table>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <div class="panel-title">Cómo funciona</div>
          </div>
          <div style="padding:14px;font-size:12px;color:var(--text2);line-height:1.7;">
            <div>• Los scopes siguen el formato <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">recurso:acción</code> (ej. <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">clients:read</code>).</div>
            <div>• <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">*</code> = permite todo globalmente (solo owner).</div>
            <div>• <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">recurso:*</code> = todas las acciones sobre ese recurso.</div>
            <div>• <code style="background:var(--card2);padding:1px 5px;border-radius:3px;">recurso:rw</code> = read + write (atajo).</div>
            <div>• Los 4 roles sistema (<span style="color:var(--success);">owner</span>, <span style="color:var(--warn);">admin</span>, <span style="color:var(--text2);">analyst</span>, <span style="color:var(--text3);">viewer</span>) no se pueden editar.</div>
          </div>
        </div>
      `;

      document.getElementById('rv-refresh').onclick = () => this.load();
      document.getElementById('rv-new').onclick = () => this.openNewRole();

      if(global.RBAC?.isOwner()){
        document.getElementById('rv-new').style.display = '';
      }

      await this.load();
    },

    async load(){
      try {
        document.getElementById('rv-sub').textContent = 'ORGANIZACIÓN · CARGANDO…';
        const roles = await global.sbGet('user_roles', 'select=*&order=is_system.desc,name');
        this._roles = roles || [];
        this.renderMatrix();
        document.getElementById('rv-sub').textContent = `ORGANIZACIÓN · ${this._roles.length} ROLES`;
        document.getElementById('rv-count').textContent = `${this._roles.length} roles`;
      } catch(err){
        console.error('[RolesView] load:', err);
        document.getElementById('rv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    renderMatrix(){
      const matrix = document.getElementById('rv-matrix');
      if(!matrix) return;

      // Header: role names
      const thead = matrix.querySelector('thead');
      thead.innerHTML = `
        <tr>
          <th style="min-width:160px;">RECURSO</th>
          ${this._roles.map(r => `
            <th style="text-align:center;">
              <div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
                <span>${escapeHtml(r.label || r.name)}</span>
                ${r.is_system
                  ? '<span class="chip chip-off" style="font-size:8px;padding:1px 5px;">SISTEMA</span>'
                  : '<span class="chip chip-aria" style="font-size:8px;padding:1px 5px;background:rgba(232,232,232,0.06);color:var(--text);">CUSTOM</span>'}
              </div>
            </th>
          `).join('')}
          <th style="width:80px;text-align:right;">Acciones</th>
        </tr>
      `;

      // Body: resources × roles · agrupados por categoría con header de grupo
      const tbody = matrix.querySelector('tbody');
      const colCount = this._roles.length + 2; // recurso + roles + acciones
      let lastGroup = null;
      tbody.innerHTML = RESOURCES.map(res => {
        const cells = this._roles.map(role => {
          const has = this._roleHasResource(role, res.key);
          return `<td style="text-align:center;">${this._renderScopeCell(role, res.key, has)}</td>`;
        }).join('');
        const groupHeader = (res.group && res.group !== lastGroup)
          ? `<tr><td colspan="${colCount}" style="padding:14px 14px 6px;background:var(--bg2);"><div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;text-transform:uppercase;">${escapeHtml(res.group)}</div></td></tr>`
          : '';
        if(res.group) lastGroup = res.group;
        const hiddenBadge = res.hidden
          ? `<span style="font-size:8px;background:var(--card3);color:var(--text3);padding:1px 5px;border-radius:3px;margin-left:6px;letter-spacing:0.5px;text-transform:uppercase;font-family:'Geist Mono',monospace;" title="Vista oculta del sidebar v1.0.16 · permiso vivo · accesible vía ⌘K">oculta</span>`
          : '';
        return groupHeader + `
          <tr>
            <td>
              <div style="font-weight:500;display:flex;align-items:center;">${escapeHtml(res.label)}${hiddenBadge}</div>
              <div class="dim" style="font-size:9px;font-family:'Geist Mono',monospace;">${res.key}</div>
            </td>
            ${cells}
            <td style="text-align:right;" class="dim">—</td>
          </tr>
        `;
      }).join('');

      // Fila de "scopes crudos" al final (debug / referencia)
      tbody.innerHTML += `
        <tr style="border-top:2px solid var(--border2);">
          <td style="vertical-align:top;padding-top:14px;">
            <div style="font-size:9px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1.5px;">SCOPES RAW</div>
          </td>
          ${this._roles.map(role => `
            <td style="vertical-align:top;padding:10px 8px;">
              <div style="display:flex;flex-wrap:wrap;gap:3px;justify-content:center;max-width:180px;margin:0 auto;">
                ${(role.scopes||[]).map(s => `<span style="font-size:8px;padding:2px 6px;background:var(--card2);border:1px solid var(--border);border-radius:3px;font-family:'Geist Mono',monospace;">${escapeHtml(s)}</span>`).join('')}
              </div>
            </td>
          `).join('')}
          <td></td>
        </tr>
        <tr>
          <td></td>
          ${this._roles.map(role => `
            <td style="text-align:center;">
              ${role.is_system
                ? `<span class="dim" style="font-size:10px;">read-only</span>`
                : (global.RBAC?.isOwner()
                    ? `<button class="btn ghost" style="font-size:10px;padding:3px 8px;" onclick="RolesView.editRole('${role.id}')">Editar</button>
                       <button class="btn ghost" style="font-size:10px;padding:3px 8px;color:var(--danger);" onclick="RolesView.deleteRole('${role.id}')">Eliminar</button>`
                    : `<span class="dim" style="font-size:10px;">sin permiso</span>`)}
            </td>
          `).join('')}
          <td></td>
        </tr>
      `;
    },

    _roleHasResource(role, resourceKey){
      const scopes = role.scopes || [];
      if(scopes.includes('*')) return 'all';
      if(scopes.includes(resourceKey + ':*')) return 'all';
      if(scopes.includes(resourceKey + ':rw')) return 'rw';
      if(scopes.includes(resourceKey + ':write')) return 'write';
      if(scopes.includes(resourceKey + ':read')) return 'read';
      return null;
    },

    _renderScopeCell(role, resourceKey, level){
      if(level === 'all')   return '<span style="color:var(--success);font-weight:700;" title="Todos los permisos">●</span>';
      if(level === 'rw')    return '<span style="color:var(--success);" title="Read + Write">◉</span>';
      if(level === 'write') return '<span style="color:var(--warn);" title="Solo write">↗</span>';
      if(level === 'read')  return '<span style="color:var(--text2);" title="Solo read">◎</span>';
      return '<span style="color:var(--text3);" title="Sin acceso">○</span>';
    },

    // ── Crear nuevo role custom ──
    openNewRole(){
      if(!global.RBAC?.isOwner()){
        global.toast?.('Solo owner puede crear roles', 'err');
        return;
      }
      this._openEditor(null);
    },

    async editRole(id){
      if(!global.RBAC?.isOwner()) return;
      const role = this._roles.find(r => r.id === id);
      if(!role || role.is_system) return;
      this._openEditor(role);
    },

    _openEditor(existing){
      const scopes = new Set(existing?.scopes || []);

      let lastGroupModal = null;
      const resourceInputs = RESOURCES.map(res => {
        const currentLevel = this._levelFromScopes(scopes, res.key);
        const groupHeader = (res.group && res.group !== lastGroupModal)
          ? `<div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin:14px 0 4px;text-transform:uppercase;padding:0 8px;">${escapeHtml(res.group)}</div>`
          : '';
        if(res.group) lastGroupModal = res.group;
        const hiddenBadge = res.hidden
          ? `<span style="font-size:8px;background:var(--card3);color:var(--text3);padding:1px 5px;border-radius:3px;margin-left:6px;letter-spacing:0.5px;text-transform:uppercase;font-family:'Geist Mono',monospace;" title="Vista oculta del sidebar v1.0.16">oculta</span>`
          : '';
        return groupHeader + `
          <div style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px dashed var(--border);">
            <div style="flex:1;">
              <div style="font-weight:500;font-size:12px;display:flex;align-items:center;">${escapeHtml(res.label)}${hiddenBadge}</div>
              <div class="dim" style="font-size:9px;font-family:'Geist Mono',monospace;">${res.key}</div>
            </div>
            <select data-res="${res.key}" class="rv-level" style="background:var(--card2);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:4px;font-size:11px;">
              <option value=""      ${!currentLevel ? 'selected' : ''}>Sin acceso</option>
              <option value="read"  ${currentLevel==='read' ? 'selected' : ''}>Read</option>
              ${res.actions.includes('rw') ? `<option value="rw" ${currentLevel==='rw' ? 'selected' : ''}>Read+Write</option>` : ''}
              ${res.actions.includes('write') ? `<option value="write" ${currentLevel==='write' ? 'selected' : ''}>Write</option>` : ''}
              ${res.actions.includes('*') ? `<option value="*" ${currentLevel==='*' ? 'selected' : ''}>Todo</option>` : ''}
            </select>
          </div>`;
      }).join('');

      const html = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">${existing ? 'Editar role' : 'Nuevo role custom'}</div>
          <button id="rv-ed-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;max-height:70vh;overflow-y:auto;">
          <div style="margin-bottom:12px;">
            <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">NOMBRE (slug)</div>
            <input id="rv-ed-name" value="${escapeHtml(existing?.name || '')}" ${existing ? 'disabled' : ''} placeholder="editor_marketing" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;outline:none;${existing ? 'opacity:0.6;' : ''}">
          </div>
          <div style="margin-bottom:12px;">
            <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">LABEL (UI)</div>
            <input id="rv-ed-label" value="${escapeHtml(existing?.label || '')}" placeholder="Editor Marketing" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
          </div>
          <div style="margin-bottom:12px;">
            <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">DESCRIPCIÓN</div>
            <textarea id="rv-ed-desc" placeholder="Qué puede hacer este role…" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;min-height:60px;">${escapeHtml(existing?.description || '')}</textarea>
          </div>
          <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin:14px 0 6px;text-transform:uppercase;">PERMISOS POR RECURSO</div>
          <div>${resourceInputs}</div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="rv-ed-cancel">Cancelar</button>
          <button class="btn primary" id="rv-ed-save">${existing ? 'Guardar cambios' : 'Crear role'}</button>
        </div>
      `;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:520px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;">${html}</div>`;
      document.body.appendChild(wrap);

      const close = () => wrap.remove();
      wrap.querySelector('#rv-ed-close').onclick = close;
      wrap.querySelector('#rv-ed-cancel').onclick = close;

      wrap.querySelector('#rv-ed-save').onclick = async () => {
        const name  = wrap.querySelector('#rv-ed-name').value.trim().toLowerCase().replace(/[^a-z0-9_]/g,'_');
        const label = wrap.querySelector('#rv-ed-label').value.trim();
        const desc  = wrap.querySelector('#rv-ed-desc').value.trim();

        if(!name){ global.toast?.('Nombre requerido', 'err'); return; }
        if(!label){ global.toast?.('Label requerido', 'err'); return; }

        const newScopes = [];
        wrap.querySelectorAll('select.rv-level').forEach(sel => {
          const res = sel.dataset.res;
          const lvl = sel.value;
          if(!lvl) return;
          if(lvl === '*')      newScopes.push(res + ':*');
          else if(lvl === 'rw') newScopes.push(res + ':rw');
          else                  newScopes.push(res + ':' + lvl);
        });

        try {
          if(existing){
            await global.sbPatch('user_roles', existing.id, { label, description: desc || null, scopes: newScopes });
            global.toast?.('Role actualizado', 'success');
          } else {
            await global.sbInsert('user_roles', { name, label, description: desc || null, scopes: newScopes, is_system: false });
            global.toast?.('Role creado', 'success');
          }
          close();
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    _levelFromScopes(scopesSet, resourceKey){
      if(scopesSet.has(resourceKey + ':*')) return '*';
      if(scopesSet.has(resourceKey + ':rw')) return 'rw';
      if(scopesSet.has(resourceKey + ':write')) return 'write';
      if(scopesSet.has(resourceKey + ':read')) return 'read';
      return null;
    },

    async deleteRole(id){
      if(!global.RBAC?.isOwner()) return;
      const role = this._roles.find(r => r.id === id);
      if(!role || role.is_system) return;

      // Verificar que nadie lo esté usando
      try {
        const users = await global.sbGet('team_members', `role_id=eq.${id}&select=id,email`);
        if(users && users.length > 0){
          global.toast?.(`No se puede eliminar: ${users.length} miembro(s) usan este role`, 'err');
          return;
        }
      } catch(e){ /* ignore */ }

      if(!(await confirmDanger(`Eliminar role "${role.label}"`, `Los miembros con este role perderán sus permisos. Esta acción no se puede deshacer.`, 'Eliminar'))) return;

      try {
        const res = await fetch(`${global.SUPABASE_URL || window.SUPABASE_URL || ''}/rest/v1/user_roles?id=eq.${id}`, {
          method: 'DELETE',
          headers: global.sbHeaders ? global.sbHeaders() : {}
        });
        if(!res.ok){
          const err = await res.json().catch(()=>({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        global.toast?.('Role eliminado', 'success');
        await this.load();
      } catch(err){
        global.toast?.('Error: ' + err.message, 'err');
      }
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)

  global.RolesView = RolesView;
})(window);
