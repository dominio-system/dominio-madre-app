// ============================================
// Dominio Madre · Vista Usuarios
// ============================================
// Lee v_team_activity (team_members + roles + último audit).
// Admin+owner pueden invitar, cambiar role, suspender, eliminar.
// Depende de: window.sbGet, sbInsert, sbPatch, RBAC, toast

(function(global){
  'use strict';

  const UsersView = {
    _members: [],
    _roles: [],
    _invitations: [],

    async render(){
      const view = document.querySelector('.view[data-view="users"]');
      if(!view) return;

      // Esqueleto
      view.innerHTML = `
        <div class="page-head">
          <div>
            <div class="page-title">Usuarios</div>
            <div class="page-sub" id="uv-sub">ORGANIZACIÓN · CARGANDO…</div>
          </div>
          <div class="page-actions">
            <button class="btn ghost" id="uv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="uv-invite">+ Invitar</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">ACTIVOS</div><div class="kpi-value" id="uv-active">—</div><div class="kpi-trend">miembros</div></div>
          <div class="kpi-card"><div class="kpi-label">INVITADOS</div><div class="kpi-value" id="uv-invited">—</div><div class="kpi-trend">pendientes</div></div>
          <div class="kpi-card"><div class="kpi-label">SUSPENDIDOS</div><div class="kpi-value" id="uv-suspended">—</div><div class="kpi-trend">sin acceso</div></div>
          <div class="kpi-card"><div class="kpi-label">2FA ACTIVO</div><div class="kpi-value" id="uv-2fa">—</div><div class="kpi-trend">seguridad</div></div>
        </div>

        <div class="sec-head"><span class="sec-label">MIEMBROS</span><span class="sec-title">Equipo interno</span><span class="sec-meta" id="uv-count">—</span></div>
        <div class="panel">
          <table class="tbl">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Email</th>
                <th>Role</th>
                <th>Estado</th>
                <th>2FA</th>
                <th>Último login</th>
                <th>Última actividad</th>
                <th style="text-align:right;">Acciones</th>
              </tr>
            </thead>
            <tbody id="uv-tbody"><tr><td colspan="8" class="dim" style="text-align:center;padding:24px;">Cargando…</td></tr></tbody>
          </table>
        </div>

        <div class="sec-head" id="uv-invites-header" style="display:none;"><span class="sec-label">INVITACIONES</span><span class="sec-title">Pendientes de aceptar</span><span class="sec-meta" id="uv-invites-meta">—</span></div>
        <div class="panel" id="uv-invites-panel" style="display:none;">
          <table class="tbl">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Invitado por</th><th>Expira</th><th>Estado</th><th style="text-align:right;">Acciones</th></tr>
            </thead>
            <tbody id="uv-invites-tbody"></tbody>
          </table>
        </div>

        <!-- MODAL INVITAR -->
        <div class="modal-overlay" id="uv-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:700;display:none;align-items:center;justify-content:center;padding:20px;">
          <div class="modal" style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:460px;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
              <div style="font-size:14px;font-weight:600;">Invitar nuevo miembro</div>
              <button style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;" id="uv-modal-close">✕</button>
            </div>
            <div style="padding:16px 20px;">
              <div style="margin-bottom:12px;">
                <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">EMAIL</div>
                <input id="uv-inv-email" type="email" placeholder="colega@empresa.com" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
              </div>
              <div style="margin-bottom:12px;">
                <div style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">ROLE</div>
                <select id="uv-inv-role" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;"></select>
              </div>
              <div style="padding:10px;background:var(--card2);border-radius:6px;font-size:11px;color:var(--text2);line-height:1.5;">
                El invitado recibirá un link con token único (vence en 7 días).
                Podrá aceptar creando su cuenta con ese email.
              </div>
            </div>
            <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
              <button class="btn ghost" id="uv-modal-cancel">Cancelar</button>
              <button class="btn primary" id="uv-modal-send">Enviar invitación</button>
            </div>
          </div>
        </div>
      `;

      // Listeners
      document.getElementById('uv-refresh').onclick = () => this.load();
      document.getElementById('uv-invite').onclick = () => this.openInviteModal();
      document.getElementById('uv-modal-close').onclick = () => this.closeModal();
      document.getElementById('uv-modal-cancel').onclick = () => this.closeModal();
      document.getElementById('uv-modal-send').onclick = () => this.sendInvite();

      // Aplicar RBAC a acciones globales
      if(global.RBAC){
        RBAC.disableIfCant(document.getElementById('uv-invite'), 'users:write');
      }

      await this.load();
    },

    async load(){
      try {
        document.getElementById('uv-sub').textContent = 'ORGANIZACIÓN · CARGANDO…';
        const [members, roles, invitations] = await Promise.all([
          global.sbGet('v_team_activity', 'select=*&order=joined_at.desc.nullslast,created_at.desc'),
          global.sbGet('user_roles', 'select=id,name,label,is_system&order=name'),
          global.sbGet('v_invitations_pending', 'select=*&order=created_at.desc').catch(()=>[])
        ]);

        this._members = members || [];
        this._roles = roles || [];
        this._invitations = invitations || [];

        this.renderKPIs();
        this.renderMembers();
        this.renderInvitations();

        document.getElementById('uv-sub').textContent = `ORGANIZACIÓN · ${this._members.length} MIEMBROS`;
      } catch(err) {
        console.error('[UsersView] load:', err);
        document.getElementById('uv-sub').textContent = 'ERROR · ' + err.message;
        document.getElementById('uv-tbody').innerHTML =
          `<tr><td colspan="8" class="dim" style="text-align:center;padding:24px;color:var(--danger);">${escapeHtml(err.message)}</td></tr>`;
      }
    },

    renderKPIs(){
      const m = this._members;
      document.getElementById('uv-active').textContent    = m.filter(x => x.status === 'active').length;
      document.getElementById('uv-invited').textContent   = this._invitations.filter(i => !i.is_expired).length;
      document.getElementById('uv-suspended').textContent = m.filter(x => x.status === 'suspended').length;
      document.getElementById('uv-2fa').textContent       = m.filter(x => x.two_factor_enabled).length;
    },

    renderMembers(){
      const tbody = document.getElementById('uv-tbody');
      document.getElementById('uv-count').textContent = `${this._members.length} miembros`;

      if(this._members.length === 0){
        tbody.innerHTML = `<tr><td colspan="8" class="dim" style="text-align:center;padding:24px;">Sin miembros aún. Invita al primero.</td></tr>`;
        return;
      }

      const canWrite = global.RBAC?.can('users:write');
      const myUserId = global.RBAC?._userId;

      tbody.innerHTML = this._members.map(m => {
        const initial = (m.full_name || m.email || '?')[0]?.toUpperCase() || '?';
        const roleChip = m.role === 'owner'   ? '<span class="chip chip-ok">OWNER</span>'
                       : m.role === 'admin'   ? '<span class="chip chip-warn">ADMIN</span>'
                       : m.role === 'analyst' ? '<span class="chip" style="background:var(--card3);color:var(--text2);">ANALYST</span>'
                       : m.role === 'viewer'  ? '<span class="chip chip-off">VIEWER</span>'
                       : `<span class="chip chip-off">${escapeHtml((m.role||'—').toUpperCase())}</span>`;
        const statusChip = m.status === 'active'    ? '<span class="chip chip-live"><span class="chip-dot"></span>LIVE</span>'
                         : m.status === 'invited'   ? '<span class="chip chip-warn"><span class="chip-dot"></span>INVITADO</span>'
                         : m.status === 'suspended' ? '<span class="chip chip-err"><span class="chip-dot"></span>SUSPENDIDO</span>'
                         : '<span class="chip chip-off">—</span>';
        const twoFa = m.two_factor_enabled
          ? '<span style="color:var(--success);">●</span>'
          : '<span style="color:var(--text3);">○</span>';
        const lastLogin = m.last_login_at ? new Date(m.last_login_at).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
        const lastAct   = m.last_audit_at ? new Date(m.last_audit_at).toLocaleString() : '—';
        const lastActAction = m.last_audit_action ? `<div class="dim" style="font-size:9px;font-family:'Geist Mono',monospace;">${escapeHtml(m.last_audit_action)}</div>` : '';

        // Acciones
        const isSelf = m.user_id && myUserId && m.user_id === myUserId;
        const actions = [];
        if(canWrite && !isSelf){
          actions.push(`<button class="icon-btn" title="Cambiar role" onclick="UsersView.openChangeRole('${m.id}')">⇅</button>`);
          if(m.status === 'active'){
            actions.push(`<button class="icon-btn" title="Suspender" onclick="UsersView.suspend('${m.id}')">⏸</button>`);
          } else if(m.status === 'suspended'){
            actions.push(`<button class="icon-btn" title="Reactivar" onclick="UsersView.reactivate('${m.id}')">▶</button>`);
          }
          if(m.role !== 'owner' || this._members.filter(x => x.role==='owner' && x.status==='active').length > 1){
            actions.push(`<button class="icon-btn" title="Eliminar" onclick="UsersView.remove('${m.id}')" style="color:var(--danger);">✕</button>`);
          }
        } else if(isSelf){
          actions.push(`<span class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">TÚ</span>`);
        }

        return `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="user-avatar" style="width:26px;height:26px;font-size:10px;">${initial}</div>
                <div>
                  <div style="font-weight:500;">${escapeHtml(m.full_name || '—')}</div>
                  ${isSelf ? '<div class="dim" style="font-size:9px;font-family:\'Geist Mono\',monospace;">SESIÓN ACTUAL</div>' : ''}
                </div>
              </div>
            </td>
            <td class="dim">${escapeHtml(m.email)}</td>
            <td>${roleChip}</td>
            <td>${statusChip}</td>
            <td>${twoFa}</td>
            <td class="num dim">${lastLogin}</td>
            <td><span class="dim">${lastAct}</span>${lastActAction}</td>
            <td style="text-align:right;">${actions.join(' ')}</td>
          </tr>`;
      }).join('');
    },

    renderInvitations(){
      const header = document.getElementById('uv-invites-header');
      const panel = document.getElementById('uv-invites-panel');
      const tbody = document.getElementById('uv-invites-tbody');
      const meta  = document.getElementById('uv-invites-meta');

      if(this._invitations.length === 0){
        header.style.display = 'none';
        panel.style.display = 'none';
        return;
      }

      header.style.display = '';
      panel.style.display = '';
      meta.textContent = `${this._invitations.length} pendiente${this._invitations.length===1?'':'s'}`;

      const canWrite = global.RBAC?.can('users:write');
      tbody.innerHTML = this._invitations.map(i => {
        const exp = new Date(i.expires_at);
        const expChip = i.is_expired
          ? '<span class="chip chip-err">EXPIRADA</span>'
          : `<span class="chip chip-warn">${exp.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</span>`;
        const actions = canWrite
          ? `
            <button class="icon-btn" title="Copiar link" onclick="UsersView.copyInviteLink('${i.token}')">🔗</button>
            <button class="icon-btn" title="Revocar" onclick="UsersView.revokeInvite('${i.id}')" style="color:var(--danger);">✕</button>
          ` : '';
        return `
          <tr>
            <td><strong>${escapeHtml(i.email)}</strong></td>
            <td><span class="chip chip-off">${escapeHtml(i.role_label || i.role || '—')}</span></td>
            <td class="dim">${escapeHtml(i.invited_by_name || i.invited_by_email || '—')}</td>
            <td>${expChip}</td>
            <td><span class="chip chip-warn"><span class="chip-dot"></span>PENDING</span></td>
            <td style="text-align:right;">${actions}</td>
          </tr>`;
      }).join('');
    },

    // ── Modal invitar ──
    openInviteModal(){
      if(!global.RBAC?.can('users:write')){
        global.toast?.('Sin permiso para invitar', 'err');
        return;
      }
      const roleSel = document.getElementById('uv-inv-role');
      roleSel.innerHTML = this._roles
        .filter(r => !(r.name === 'owner' && !global.RBAC?.isOwner()))
        .map(r => `<option value="${r.id}">${escapeHtml(r.label || r.name)}</option>`)
        .join('');
      // Default a viewer si existe
      const viewer = this._roles.find(r => r.name === 'viewer');
      if(viewer) roleSel.value = viewer.id;

      document.getElementById('uv-inv-email').value = '';
      document.getElementById('uv-modal').style.display = 'flex';
      setTimeout(() => document.getElementById('uv-inv-email').focus(), 50);
    },

    closeModal(){
      document.getElementById('uv-modal').style.display = 'none';
    },

    async sendInvite(){
      const email = document.getElementById('uv-inv-email').value.trim().toLowerCase();
      const roleId = document.getElementById('uv-inv-role').value;

      if(!email || !email.includes('@')){
        global.toast?.('Email inválido', 'err');
        return;
      }
      if(!roleId){
        global.toast?.('Selecciona un role', 'err');
        return;
      }

      // Validar que no esté ya invitado o sea miembro
      if(this._members.some(m => m.email === email)){
        global.toast?.('Ya es miembro del equipo', 'err');
        return;
      }
      if(this._invitations.some(i => i.email === email && !i.is_expired)){
        global.toast?.('Ya tiene invitación pendiente', 'warn');
        return;
      }

      try {
        await global.sbInsert('invitations', {
          email,
          role_id: roleId,
          invited_by: global.RBAC?._userId || null,
          status: 'pending'
        });
        this.closeModal();
        global.toast?.(`Invitación enviada a ${email}`, 'success');
        await this.load();
      } catch(err){
        console.error('[UsersView] sendInvite:', err);
        global.toast?.('Error: ' + err.message, 'err');
      }
    },

    // ── Cambiar role ──
    async openChangeRole(memberId){
      const m = this._members.find(x => x.id === memberId);
      if(!m) return;

      const options = this._roles
        .filter(r => !(r.name === 'owner' && !global.RBAC?.isOwner()))
        .map(r => `<option value="${r.id}" ${r.name === m.role ? 'selected' : ''}>${escapeHtml(r.label || r.name)}</option>`)
        .join('');

      const html = `
        <div style="padding:16px;">
          <div style="font-size:13px;margin-bottom:10px;">Cambiar role de <strong>${escapeHtml(m.full_name || m.email)}</strong></div>
          <select id="uv-cr-role" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;outline:none;">
            ${options}
          </select>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
            <button class="btn ghost" id="uv-cr-cancel">Cancelar</button>
            <button class="btn primary" id="uv-cr-save">Guardar</button>
          </div>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:400px;">${html}</div>`;
      document.body.appendChild(wrap);

      wrap.querySelector('#uv-cr-cancel').onclick = () => wrap.remove();
      wrap.querySelector('#uv-cr-save').onclick = async () => {
        const newRoleId = wrap.querySelector('#uv-cr-role').value;
        try {
          await global.sbPatch('team_members', memberId, { role_id: newRoleId });
          wrap.remove();
          global.toast?.('Role actualizado', 'success');
          await this.load();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    async suspend(memberId){
      if(!confirm('¿Suspender a este miembro? Perderá acceso inmediatamente.')) return;
      try {
        await global.sbPatch('team_members', memberId, { status: 'suspended' });
        global.toast?.('Miembro suspendido', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async reactivate(memberId){
      try {
        await global.sbPatch('team_members', memberId, { status: 'active' });
        global.toast?.('Miembro reactivado', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async remove(memberId){
      const m = this._members.find(x => x.id === memberId);
      if(!m) return;
      if(!confirm(`¿Eliminar a ${m.full_name || m.email} del equipo? Esta acción no se puede deshacer.`)) return;
      try {
        const res = await fetch(`${global.SUPABASE_URL || window.SUPABASE_URL || ''}/rest/v1/team_members?id=eq.${memberId}`, {
          method: 'DELETE',
          headers: global.sbHeaders ? global.sbHeaders() : { 'apikey': '', 'Content-Type': 'application/json' }
        });
        if(!res.ok){
          const err = await res.json().catch(()=>({}));
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        global.toast?.('Miembro eliminado', 'success');
        await this.load();
      } catch(err){
        global.toast?.('Error: ' + err.message, 'err');
      }
    },

    async copyInviteLink(token){
      const link = `https://app.dominiosystem.com/accept-invite?token=${token}`;
      try {
        await navigator.clipboard.writeText(link);
        global.toast?.('Link copiado al portapapeles', 'success');
      } catch(e){
        prompt('Copia este link:', link);
      }
    },

    async revokeInvite(invId){
      if(!confirm('¿Revocar esta invitación?')) return;
      try {
        await global.sbPatch('invitations', invId, { status: 'revoked' });
        global.toast?.('Invitación revocada', 'success');
        await this.load();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    }
  };

  // ── Helper local (por si app-madre no lo exporta) ──
  function escapeHtml(s){
    if(s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  global.UsersView = UsersView;
})(window);
