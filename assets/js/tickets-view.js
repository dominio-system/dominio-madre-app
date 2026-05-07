// ============================================
// Dominio Madre · Vista Tickets (Fase 3)
// ============================================
// Inbox soporte · inbox izquierda + detalle derecha con thread de mensajes.
(function(global){
  'use strict';

  const TicketsView = {
    _tickets: [],
    _selected: null,
    _messages: [],
    _filter: 'open',
    _assigneeFilter: 'all', // v1.0.26 · 'all' | 'mine' | 'unassigned'
    // v1.0.23 · Cache de mensajes por ticket_id (TTL 30s)
    _messagesCache: new Map(),  // ticket_id → { msgs, fetchedAt }
    _MESSAGES_TTL_MS: 30000,
    // Cache de internalCount por ticket_id (para badge en lista)
    _internalCounts: new Map(),

    async render(){
      const view = document.querySelector('.view[data-view="tickets"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Tickets</div><div class="page-sub" id="tv-sub">SOPORTE · CARGANDO…</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="tv-refresh">↻ Refrescar</button>
            <button class="btn ghost" id="tv-export" title="Descargar CSV">⬇ CSV</button>
            <button class="btn primary" id="tv-new">+ Crear ticket</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">ABIERTOS</div><div class="kpi-value" id="tv-open" style="color:var(--warn);">—</div><div class="kpi-trend">sin resolver</div></div>
          <div class="kpi-card"><div class="kpi-label">SLA ROTO</div><div class="kpi-value" id="tv-sla-breach" style="color:var(--danger);">—</div><div class="kpi-trend down">fuera de tiempo</div></div>
          <div class="kpi-card"><div class="kpi-label">RESUELTOS 30D</div><div class="kpi-value" id="tv-resolved" style="color:var(--success);">—</div><div class="kpi-trend up">último mes</div></div>
          <div class="kpi-card"><div class="kpi-label">SATISFACCIÓN</div><div class="kpi-value" id="tv-csat">—</div><div class="kpi-trend">CSAT promedio</div></div>
        </div>

        <div style="display:grid;grid-template-columns:340px 1fr;gap:12px;margin-top:12px;height:calc(100vh - 360px);min-height:400px;">
          <!-- LEFT: inbox -->
          <div class="panel" style="display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
              <button class="filter-pill-btn active" data-tf="open"    onclick="TicketsView.setFilter('open')">● Abiertos <span class="count">(<span data-tv-count="open">0</span>)</span></button>
              <button class="filter-pill-btn" data-tf="pending" onclick="TicketsView.setFilter('pending')">⏱ Pending <span class="count">(<span data-tv-count="pending">0</span>)</span></button>
              <button class="filter-pill-btn" data-tf="resolved" onclick="TicketsView.setFilter('resolved')">✓ Resueltos <span class="count">(<span data-tv-count="resolved">0</span>)</span></button>
              <button class="filter-pill-btn" data-tf="all"     onclick="TicketsView.setFilter('all')">Todos <span class="count">(<span data-tv-count="all">0</span>)</span></button>
              <span style="color:var(--text4);font-size:9px;margin:0 2px;">·</span>
              <button class="filter-pill-btn active" data-ta="all" onclick="TicketsView.setAssignee('all')" style="font-size:10px;">Equipo</button>
              <button class="filter-pill-btn" data-ta="mine" onclick="TicketsView.setAssignee('mine')" style="font-size:10px;">⭐ Mis asignados</button>
              <button class="filter-pill-btn" data-ta="unassigned" onclick="TicketsView.setAssignee('unassigned')" style="font-size:10px;">⊘ Sin asignar</button>
            </div>
            <div id="tv-list" style="flex:1;overflow-y:auto;"></div>
          </div>

          <!-- RIGHT: ticket detail -->
          <div class="panel" id="tv-detail" style="display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:40px 20px;text-align:center;color:var(--text3);margin:auto;">
              <div style="font-size:36px;margin-bottom:10px;opacity:0.3;">📋</div>
              <div style="font-size:12px;">Selecciona un ticket</div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('tv-refresh').onclick = () => this.load();
      document.getElementById('tv-new').onclick = () => this.openCreateModal();
      document.getElementById('tv-export').onclick = () => MadreExport.csv({
        filename: `tickets-${new Date().toISOString().slice(0,10)}.csv`,
        headers: ['ID','Asunto','Cliente','Email','Status','Prioridad','Categoria','Source','SLA Deadline','SLA Breach','Created','First Response','Resolved','Closed','CSAT'],
        rows: (this._filtered() || []).map(t => [
          t.id?.slice(0,8) || '',
          t.subject || '', t.client_empresa || '', t.requester_email || '',
          t.status || '', t.priority || '', t.category || '', t.source || '',
          t.sla_deadline || '', t.sla_breached ? 'YES' : 'no',
          t.created_at || '', t.first_response_at || '',
          t.resolved_at || '', t.closed_at || '',
          t.satisfaction_score || '',
        ]),
      });
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('tv-new'), 'tickets:rw');
      await this.load();
    },

    setFilter(f){
      this._filter = f;
      document.querySelectorAll('.filter-pill-btn[data-tf]').forEach(t => t.classList.toggle('active', t.dataset.tf === f));
      // Update counts
      const counts = { all: this._tickets.length, open:0, pending:0, resolved:0 };
      this._tickets.forEach(t => { if(counts[t.status] !== undefined) counts[t.status]++; });
      Object.entries(counts).forEach(([k,v]) => {
        const el = document.querySelector(`[data-tv-count="${k}"]`);
        if(el) el.textContent = v;
      });
      this.renderList();
    },

    // v1.0.26 · filtro de asignado (Enterprise · multi-agente)
    setAssignee(a){
      this._assigneeFilter = a;
      document.querySelectorAll('.filter-pill-btn[data-ta]').forEach(t => t.classList.toggle('active', t.dataset.ta === a));
      this.renderList();
    },

    async load(){
      try {
        document.getElementById('tv-sub').textContent = 'SOPORTE · CARGANDO…';
        this._tickets = await global.sbGet('v_tickets_overview', 'select=*&order=updated_at.desc.nullslast,created_at.desc&limit=200') || [];
        this.renderKPIs();
        this.renderList();
        document.getElementById('tv-sub').textContent = `SOPORTE · ${this._tickets.length} TICKETS`;
        // v1.0.23 · Background prefetch de internal_counts (no bloqueante)
        this._prefetchInternalCounts().catch(()=>{});
      } catch(err){
        document.getElementById('tv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    // v1.0.23 · Single query que trae counts de notas internas para badges en lista
    async _prefetchInternalCounts(){
      try {
        // PostgREST: GET /ticket_messages?select=ticket_id&is_internal=eq.true → array de rows
        // luego agrupamos client-side. Eficiente porque solo trae 1 columna.
        const rows = await global.sbGet('ticket_messages', 'select=ticket_id&is_internal=eq.true&limit=2000');
        const counts = new Map();
        (rows || []).forEach(r => {
          counts.set(r.ticket_id, (counts.get(r.ticket_id) || 0) + 1);
        });
        // Reset solo los IDs que conocemos
        this._internalCounts = counts;
        // Re-render lista para que aparezcan badges
        this.renderList();
      } catch(e){
        // Silencioso: el badge no es crítico
      }
    },

    renderKPIs(){
      const open = this._tickets.filter(t => ['new','open','pending','waiting_customer'].includes(t.status)).length;
      const slaBreach = this._tickets.filter(t => t.sla_breached).length;
      const d30 = new Date(Date.now() - 30*864e5);
      const resolved30 = this._tickets.filter(t => t.resolved_at && new Date(t.resolved_at) >= d30).length;
      const csats = this._tickets.filter(t => t.satisfaction_score != null).map(t => t.satisfaction_score);
      const avgCsat = csats.length ? (csats.reduce((a,b)=>a+b,0) / csats.length).toFixed(1) : null;

      document.getElementById('tv-open').textContent        = open;
      document.getElementById('tv-sla-breach').textContent  = slaBreach;
      document.getElementById('tv-resolved').textContent    = resolved30;
      document.getElementById('tv-csat').textContent        = avgCsat ? avgCsat + '/5' : '—';
    },

    _filtered(){
      let out = this._tickets;
      // Filtro status
      if(this._filter === 'open')    out = out.filter(t => ['new','open','waiting_customer'].includes(t.status));
      else if(this._filter === 'pending') out = out.filter(t => t.status === 'pending');
      else if(this._filter === 'resolved') out = out.filter(t => ['resolved','closed'].includes(t.status));
      // v1.0.26 · Filtro asignado
      const myUserId = global.RBAC?._userId;
      if(this._assigneeFilter === 'mine' && myUserId){
        out = out.filter(t => t.assigned_to === myUserId);
      } else if(this._assigneeFilter === 'unassigned'){
        out = out.filter(t => !t.assigned_to);
      }
      return out;
    },

    renderList(){
      const list = document.getElementById('tv-list');
      const rows = this._filtered();
      if(rows.length === 0){
        list.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--text3);font-size:11px;">Sin tickets con este filtro.</div>`;
        return;
      }
      list.innerHTML = rows.map(t => {
        const priColor = t.priority === 'urgent' ? 'var(--danger)' : t.priority === 'high' ? 'var(--warn)' : 'var(--text3)';
        const isSelected = this._selected?.id === t.id;
        const sla = t.sla_breached ? '<span class="chip chip-err" style="font-size:8px;">SLA!</span>' : '';
        // v1.0.23 · Indicador de notas internas (consultado desde cache calculado en _loadMessages)
        const internalCount = this._internalCounts.get(t.id) || 0;
        const internalBadge = internalCount > 0
          ? `<span style="font-size:9px;color:var(--warn);font-family:'Geist Mono',monospace;" title="${internalCount} nota${internalCount===1?'':'s'} interna${internalCount===1?'':'s'}">🔒 ${internalCount}</span>`
          : '';
        return `
          <div class="tv-item" onclick="TicketsView.selectTicket('${t.id}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;${isSelected ? 'background:var(--card2);' : ''}">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="color:${priColor};font-size:10px;">●</span>
              <strong style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.subject)}</strong>
              ${sla}
            </div>
            <div class="dim" style="font-size:10px;margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.requester_name || t.requester_email)}</div>
            <div style="display:flex;align-items:center;gap:6px;font-size:9px;">
              <span class="chip chip-${t.status==='resolved' || t.status==='closed' ? 'ok' : t.status==='pending' ? 'warn' : 'off'}" style="font-size:8px;padding:1px 5px;">${escapeHtml((t.status||'—').toUpperCase())}</span>
              <span class="dim">${t.message_count||0} msg</span>
              ${internalBadge}
              <span class="dim" style="margin-left:auto;">${timeAgo(t.updated_at || t.created_at)}</span>
            </div>
          </div>`;
      }).join('');
    },

    async selectTicket(id){
      const t = this._tickets.find(x => x.id === id);
      if(!t) return;
      const sameTicket = this._selected?.id === id;
      this._selected = t;
      this.renderList();
      // v1.0.23 · Skeleton instantáneo (no esperar fetch)
      if(!sameTicket) this._renderSkeleton(t);
      await this.renderDetail({ useCache: true });
    },

    _renderSkeleton(t){
      const detail = document.getElementById('tv-detail');
      if(!detail) return;
      detail.innerHTML = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <strong style="font-size:14px;flex:1;">${escapeHtml(t.subject || '')}</strong>
          </div>
          <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">Cargando hilo…</div>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:11px;">
          <div style="text-align:center;">
            <div style="width:20px;height:20px;border:2px solid var(--border2);border-top-color:var(--text2);border-radius:50%;margin:0 auto 8px;animation:tv-spin 0.8s linear infinite;"></div>
            <style>@keyframes tv-spin{to{transform:rotate(360deg)}}</style>
            Cargando mensajes…
          </div>
        </div>`;
    },

    async _loadMessages(ticketId, opts = {}){
      const useCache = opts.useCache !== false;
      const cached = this._messagesCache.get(ticketId);
      if(useCache && cached && (Date.now() - cached.fetchedAt) < this._MESSAGES_TTL_MS){
        return cached.msgs;
      }
      try {
        const msgs = await global.sbGet('ticket_messages', `ticket_id=eq.${ticketId}&select=*&order=created_at.asc`) || [];
        this._messagesCache.set(ticketId, { msgs, fetchedAt: Date.now() });
        // Actualizar count de notas internas
        this._internalCounts.set(ticketId, msgs.filter(m => m.is_internal).length);
        return msgs;
      } catch(e){
        return cached?.msgs || [];
      }
    },

    _invalidateMessageCache(ticketId){
      this._messagesCache.delete(ticketId);
    },

    async renderDetail(opts = {}){
      const t = this._selected;
      if(!t){ return; }
      const detail = document.getElementById('tv-detail');

      // v1.0.23 · Cache + parallel-safe
      this._messages = await this._loadMessages(t.id, { useCache: opts.useCache !== false });

      const priChip = t.priority === 'urgent' ? '<span class="chip chip-err">URGENT</span>'
                    : t.priority === 'high'   ? '<span class="chip chip-warn">HIGH</span>'
                    : t.priority === 'low'    ? '<span class="chip chip-off">LOW</span>'
                    : '<span class="chip chip-off">NORMAL</span>';
      const statusChip = t.status === 'resolved' || t.status === 'closed'
        ? '<span class="chip chip-ok"><span class="chip-dot"></span>' + (t.status||'').toUpperCase() + '</span>'
        : '<span class="chip chip-warn"><span class="chip-dot"></span>' + (t.status||'NEW').toUpperCase() + '</span>';

      // v1.0.23 · Contadores de mensajes (públicos vs notas internas)
      const totalMsgs = this._messages.length;
      const internalCount = this._messages.filter(m => m.is_internal).length;
      const publicCount = totalMsgs - internalCount;

      detail.innerHTML = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <strong style="font-size:14px;flex:1;">${escapeHtml(t.subject)}</strong>
            ${priChip}${statusChip}
          </div>
          <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">${escapeHtml(t.requester_name || '')} · ${escapeHtml(t.requester_email)} · ${t.source||'web'}</div>
          <div class="dim" style="font-size:10px;margin-top:3px;display:flex;gap:10px;align-items:center;">
            <span>Cliente: ${escapeHtml(t.client_empresa || '—')}</span>
            <span>·</span>
            <span>Asignado: ${escapeHtml(t.assignee_name || 'sin asignar')}</span>
            <span style="margin-left:auto;font-family:'Geist Mono',monospace;">
              ${publicCount} pública${publicCount===1?'':'s'}${internalCount > 0 ? ` · <span style="color:var(--warn);">🔒 ${internalCount} nota${internalCount===1?'':'s'} interna${internalCount===1?'':'s'}</span>` : ''}
            </span>
          </div>
        </div>

        <div id="tv-thread" style="flex:1;overflow-y:auto;padding:14px 18px;">
          <div style="padding:12px;background:var(--card2);border-radius:6px;margin-bottom:12px;">
            <div class="dim" style="font-size:10px;margin-bottom:5px;">${escapeHtml(t.requester_name || t.requester_email)} · ${new Date(t.created_at).toLocaleString()}</div>
            <div style="font-size:12px;white-space:pre-wrap;">${escapeHtml(t.body || '')}</div>
          </div>
          ${this._messages.map(m => {
            const isInt = !!m.is_internal;
            const bgInternal = 'background:rgba(255,176,32,0.10);border:1px solid rgba(255,176,32,0.30);border-left:4px solid var(--warn);';
            const bgAgent    = 'background:var(--aria-s);';
            const bgCustomer = 'background:var(--card2);';
            const blockStyle = isInt ? bgInternal : (m.author_type === 'agent' ? bgAgent : bgCustomer);
            return `
            <div style="padding:12px 14px;${blockStyle}border-radius:6px;margin-bottom:10px;">
              ${isInt ? `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed rgba(255,176,32,0.4);">
                  <span style="font-size:13px;">🔒</span>
                  <span style="font-size:10px;font-family:'Geist Mono',monospace;letter-spacing:1.5px;text-transform:uppercase;color:var(--warn);font-weight:600;">NOTA INTERNA · solo visible para tu equipo</span>
                </div>
              ` : ''}
              <div class="dim" style="font-size:10px;margin-bottom:5px;">
                ${escapeHtml(m.author_email || m.author_type)} · ${new Date(m.created_at).toLocaleString()}
                ${m.author_type === 'agent' && !isInt ? '<span class="chip chip-ok" style="font-size:8px;margin-left:6px;">✉ ENVIADO AL CLIENTE</span>' : ''}
              </div>
              <div style="font-size:12px;white-space:pre-wrap;line-height:1.5;">${escapeHtml(m.body)}</div>
            </div>`;
          }).join('')}
        </div>

        <div style="padding:12px 14px;border-top:1px solid var(--border);">
          <textarea id="tv-reply" placeholder="Escribe tu respuesta…" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;min-height:70px;resize:vertical;outline:none;"></textarea>
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">
            <label style="font-size:10px;color:var(--text3);display:flex;align-items:center;gap:4px;"><input type="checkbox" id="tv-internal"> nota interna</label>
            <div style="margin-left:auto;display:flex;gap:6px;">
              ${t.status !== 'resolved' && t.status !== 'closed' ? `<button class="btn primary" style="background:var(--success);border-color:var(--success);color:#000;" onclick="TicketsView.resolveAndEmail('${t.id}')" title="Marca como resuelto y envía email al cliente desde soporte@dominiosystem.com">✓ Resolver + email</button>` : `<button class="btn ghost" onclick="TicketsView.reopen('${t.id}')">Reabrir</button>`}
              <button class="btn ghost" onclick="TicketsView.sendReply('${t.id}')" title="Solo guarda nota interna · sin email">Guardar nota</button>
            </div>
          </div>
        </div>
      `;
    },

    async sendReply(ticketId){
      const body = document.getElementById('tv-reply').value.trim();
      if(!body){ global.toast?.('Escribe algo', 'err'); return; }
      const isInternal = document.getElementById('tv-internal').checked;
      const btn = event?.target;
      if(btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }
      try {
        const inserted = await global.sbInsert('ticket_messages', {
          ticket_id: ticketId,
          author_type: 'agent',
          author_id: global.RBAC?._userId || null,
          author_email: (global.USER?.email) || null,
          body,
          is_internal: isInternal
        });
        // Si no era nota interna y el ticket está nuevo, cambiar a pending
        const t = this._tickets.find(x => x.id === ticketId);
        if(!isInternal && t?.status === 'new'){
          await global.sbPatch('tickets', ticketId, { status: 'pending', first_response_at: t.first_response_at || new Date().toISOString() });
          if(t){ t.status = 'pending'; t.first_response_at = t.first_response_at || new Date().toISOString(); }
        }
        // v1.0.23 · Optimistic update: agregamos el mensaje al cache local
        // sin re-fetch del array completo de tickets (-300ms)
        const newMsg = Array.isArray(inserted) ? inserted[0] : inserted;
        const cached = this._messagesCache.get(ticketId);
        if(cached && newMsg){
          cached.msgs.push(newMsg);
          cached.fetchedAt = Date.now();
        } else {
          this._invalidateMessageCache(ticketId);
        }
        document.getElementById('tv-reply').value = '';
        document.getElementById('tv-internal').checked = false;
        global.toast?.(isInternal ? '🔒 Nota interna guardada' : 'Respuesta guardada', 'success');
        // Refresh detail (usa cache · instant) sin re-fetch tickets list
        await this.renderDetail({ useCache: true });
      } catch(err){
        if(btn){ btn.disabled = false; btn.textContent = 'Guardar nota'; }
        global.toast?.('Error: ' + err.message, 'err');
      }
    },

    // Legacy · solo cambia status sin email (kept for compat con accesos antiguos)
    async resolve(id){
      try {
        await global.sbPatch('tickets', id, { status: 'resolved', resolved_at: new Date().toISOString() });
        global.toast?.('Ticket resuelto (sin email)', 'success');
        await this.load();
        this._selected = this._tickets.find(x => x.id === id);
        await this.renderDetail();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    // v1.0.22 · Resolver + enviar email al cliente desde soporte@dominiosystem.com
    // Reusa el textarea (#tv-reply) como mensaje de resolución.
    // Llama a Edge Function ticket-resolve que: insert ticket_messages,
    // update tickets.status='resolved', send Resend email FROM soporte@.
    async resolveAndEmail(ticketId){
      const t = this._tickets.find(x => x.id === ticketId);
      if(!t){ global.toast?.('Ticket no encontrado', 'err'); return; }
      if(!t.requester_email){
        global.toast?.('Ticket sin email · usa "Guardar nota" o reabre desde otro canal', 'err');
        return;
      }
      const message = (document.getElementById('tv-reply')?.value || '').trim();
      if(message.length < 3){
        global.toast?.('Escribe la solución en el textarea (mínimo 3 caracteres) antes de resolver', 'warn');
        document.getElementById('tv-reply')?.focus();
        return;
      }

      // Confirmación con preview del email
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:560px;">
          <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
            <div style="font-size:14px;font-weight:600;">Resolver y enviar email</div>
            <button id="re-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
          </div>
          <div style="padding:14px 18px;">
            <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">DESTINATARIO</div>
            <div style="padding:10px;background:var(--card2);border-radius:5px;font-size:12px;margin-bottom:14px;">
              <div><strong>${escapeHtml(t.requester_name || t.requester_email)}</strong></div>
              <div class="dim" style="font-family:'Geist Mono',monospace;font-size:11px;">${escapeHtml(t.requester_email)}</div>
            </div>
            <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">REMITENTE</div>
            <div style="font-size:11px;color:var(--text2);margin-bottom:14px;font-family:'Geist Mono',monospace;">soporte@dominiosystem.com</div>
            <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">ASUNTO</div>
            <div style="font-size:12px;color:var(--text);margin-bottom:14px;">Re: ${escapeHtml(t.subject)}</div>
            <div style="font-size:11px;color:var(--text3);font-family:'Geist Mono',monospace;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">MENSAJE DE RESOLUCIÓN</div>
            <div style="padding:10px;background:var(--card2);border-radius:5px;font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:160px;overflow-y:auto;">${escapeHtml(message)}</div>
            <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:11px;cursor:pointer;color:var(--text2);">
              <input type="checkbox" id="re-close-too"> Marcar también como cerrado (status=closed · cliente no puede reabrir)
            </label>
          </div>
          <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
            <button class="btn ghost" id="re-cancel">Cancelar</button>
            <button class="btn primary" id="re-send" style="background:var(--success);border-color:var(--success);color:#000;">✓ Resolver y enviar</button>
          </div>
        </div>
      `;
      document.body.appendChild(wrap);
      const close = () => wrap.remove();
      wrap.querySelector('#re-close').onclick = close;
      wrap.querySelector('#re-cancel').onclick = close;
      wrap.querySelector('#re-send').onclick = async () => {
        const btn = wrap.querySelector('#re-send');
        btn.disabled = true;
        btn.textContent = 'Enviando…';
        const alsoClose = wrap.querySelector('#re-close-too').checked;
        try {
          const token = global.SESSION?.accessToken || global.SUPABASE_ANON;
          const r = await fetch(`${global.SUPABASE_URL}/functions/v1/ticket-resolve`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + token,
              'apikey': global.SUPABASE_ANON,
            },
            body: JSON.stringify({
              ticket_id: ticketId,
              resolution_message: message,
              also_close: alsoClose,
            }),
          });
          const data = await r.json().catch(() => ({}));
          if(!r.ok || !data.success){
            throw new Error(data.error || `HTTP ${r.status}`);
          }
          close();
          // Limpiar textarea
          const ta = document.getElementById('tv-reply');
          if(ta) ta.value = '';
          // v1.0.23 · Update local sin re-fetch de tickets list
          if(t){
            t.status = alsoClose ? 'closed' : 'resolved';
            t.resolved_at = new Date().toISOString();
            if(alsoClose) t.closed_at = t.resolved_at;
          }
          this._invalidateMessageCache(ticketId); // re-fetch para incluir el ticket_message del agente
          this.renderKPIs();
          this.renderList();
          // Mensaje según email_sent (best-effort en backend)
          if(data.email_sent){
            global.toast?.(`✓ Email enviado a ${t.requester_email}`, 'success');
          } else {
            global.toast?.(`Ticket resuelto · email FALLÓ: ${data.email_error?.message || 'unknown'}`, 'warn');
          }
          await this.renderDetail({ useCache: false });
        } catch(err){
          btn.disabled = false;
          btn.textContent = '✓ Resolver y enviar';
          global.toast?.('Error: ' + (err.message || 'No se pudo enviar'), 'err');
        }
      };
    },
    async reopen(id){
      try {
        await global.sbPatch('tickets', id, { status: 'open', resolved_at: null });
        global.toast?.('Ticket reabierto', 'success');
        await this.load();
        this._selected = this._tickets.find(x => x.id === id);
        await this.renderDetail();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    openCreateModal(){
      if(!global.RBAC?.can('tickets:rw')){ global.toast?.('Sin permiso', 'err'); return; }
      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">Nuevo ticket</div>
          <button id="tc-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">NOMBRE SOLICITANTE</div>
            <input id="tc-name" type="text" placeholder="Cliente o contacto" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">EMAIL *</div>
            <input id="tc-email" type="email" placeholder="cliente@email.com" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;"></div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">ASUNTO *</div>
            <input id="tc-subject" type="text" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px;">
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">PRIORIDAD</div>
            <select id="tc-priority" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">CATEGORÍA</div>
            <input id="tc-category" type="text" placeholder="billing / tech / general" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;"></div>
            <div><div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">FUENTE</div>
            <select id="tc-source" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
              <option value="web">Web</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="phone">Teléfono</option><option value="internal">Interno</option>
            </select></div>
          </div>
          <div style="margin-bottom:10px;">
            <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">DESCRIPCIÓN</div>
            <textarea id="tc-body" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;min-height:100px;"></textarea>
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="tc-cancel">Cancelar</button>
          <button class="btn primary" id="tc-save">Crear</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;">${body}</div>`;
      document.body.appendChild(wrap);

      const close = () => wrap.remove();
      wrap.querySelector('#tc-close').onclick = close;
      wrap.querySelector('#tc-cancel').onclick = close;
      wrap.querySelector('#tc-save').onclick = async () => {
        const requester_email = wrap.querySelector('#tc-email').value.trim();
        const requester_name  = wrap.querySelector('#tc-name').value.trim();
        const subject = wrap.querySelector('#tc-subject').value.trim();
        const bodyTxt = wrap.querySelector('#tc-body').value.trim();
        const priority = wrap.querySelector('#tc-priority').value;
        const category = wrap.querySelector('#tc-category').value.trim();
        const source = wrap.querySelector('#tc-source').value;

        if(!requester_email){ global.toast?.('Email requerido', 'err'); return; }
        if(!subject){ global.toast?.('Asunto requerido', 'err'); return; }

        const slaHours = priority === 'urgent' ? 2 : priority === 'high' ? 8 : priority === 'normal' ? 24 : 72;
        try {
          await global.sbInsert('tickets', {
            requester_email, requester_name: requester_name || null, subject,
            body: bodyTxt || null, priority, category: category || null, source,
            status: 'new',
            sla_deadline: new Date(Date.now() + slaHours*3600*1000).toISOString(),
            created_by: global.RBAC?._userId || null
          });
          close();
          global.toast?.('Ticket creado', 'success');
          await this.load();
        } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
      };
    }
  };

  // escapeHtml viene de utils.js (window.escapeHtml)
  // timeAgo es local porque tiene formato compacto (sin "hace ") distinto al de MadreUtils.relativeTime
  function timeAgo(iso){
    if(!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
    if(s < 60) return s + 's';
    if(s < 3600) return Math.floor(s/60) + 'm';
    if(s < 86400) return Math.floor(s/3600) + 'h';
    return Math.floor(s/86400) + 'd';
  }

  global.TicketsView = TicketsView;
})(window);
