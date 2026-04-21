// ============================================
// Dominio Madre · RBAC helper
// ============================================
// Cache de scopes del team_member logueado + helpers de permisos.
// Usa has_permission() de Postgres (fuente de verdad) + cache local.
//
// Scopes soportados:
//   "*"              → owner (todo)
//   "resource:*"     → todo sobre recurso
//   "resource:rw"    → read + write
//   "resource:read"  → solo lectura
//   "resource:write" → solo escritura
//
// Uso en UI:
//   if (await RBAC.can('api_keys:write')) { showButton(); }
//   RBAC.showIfCan(elem, 'users:rw');

(function(global){
  'use strict';

  const RBAC = {
    _scopes: null,         // cache de scopes del user actual
    _role: null,           // 'owner' | 'admin' | ...
    _roleLabel: null,
    _userId: null,
    _loaded: false,

    // ── Carga inicial (llamar después de login) ──
    async init({ sbGet, userId }){
      if(!userId) {
        console.warn('[RBAC] init sin userId');
        return;
      }
      this._userId = userId;
      try {
        const rows = await sbGet('v_team_activity', `user_id=eq.${userId}&select=role,role_label,role_scopes`);
        if(rows && rows.length){
          this._role       = rows[0].role;
          this._roleLabel  = rows[0].role_label;
          this._scopes     = rows[0].role_scopes || [];
          this._loaded     = true;
          console.log(`[RBAC] Loaded: ${this._role} with ${this._scopes.length} scopes`);
        } else {
          console.warn('[RBAC] team_member no encontrado — usuario sin permisos');
          this._scopes = [];
          this._loaded = true;
        }
      } catch(err){
        console.error('[RBAC] init error:', err);
        this._scopes = [];
        this._loaded = true;
      }
    },

    // ── Check síncrono (usa cache) ──
    can(scope){
      if(!this._loaded) return false;
      if(!scope) return false;
      if(!this._scopes || this._scopes.length === 0) return false;

      // Owner wildcard
      if(this._scopes.includes('*')) return true;

      // Match exacto
      if(this._scopes.includes(scope)) return true;

      // Match por recurso (resource:* cubre todo)
      const resource = scope.split(':')[0];
      if(this._scopes.includes(resource + ':*')) return true;

      // resource:rw cubre :read y :write
      if((scope === resource + ':read' || scope === resource + ':write')
         && this._scopes.includes(resource + ':rw')) return true;

      return false;
    },

    // ── Roles shortcuts ──
    isOwner(){ return this._role === 'owner'; },
    isAdmin(){ return this._role === 'owner' || this._role === 'admin'; },
    role()     { return this._role; },
    roleLabel(){ return this._roleLabel; },
    scopes()   { return this._scopes || []; },

    // ── UI helpers: oculta elemento si no tiene permiso ──
    showIfCan(elem, scope){
      if(!elem) return;
      elem.style.display = this.can(scope) ? '' : 'none';
    },

    // ── Disable botón si no tiene permiso (y agrega tooltip) ──
    disableIfCant(elem, scope){
      if(!elem) return;
      if(!this.can(scope)){
        elem.disabled = true;
        elem.title = 'No tienes permiso para esta acción';
        elem.style.opacity = '0.4';
        elem.style.cursor = 'not-allowed';
      }
    },

    // ── Check async con RPC (fuente de verdad en Postgres) ──
    // Útil para validaciones sensibles (antes de acciones destructivas).
    async canRemote(scope, { sb }){
      if(!sb) return this.can(scope); // fallback a cache
      try {
        const { data, error } = await sb.rpc('has_permission', { required_scope: scope });
        if(error){ console.warn('[RBAC] canRemote error:', error); return this.can(scope); }
        return !!data;
      } catch(err){
        console.warn('[RBAC] canRemote exception:', err);
        return this.can(scope);
      }
    },

    // ── Reset (para logout) ──
    reset(){
      this._scopes = null;
      this._role = null;
      this._roleLabel = null;
      this._userId = null;
      this._loaded = false;
    }
  };

  global.RBAC = RBAC;
})(window);
