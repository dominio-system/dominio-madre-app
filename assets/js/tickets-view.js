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

    async render(){
      const view = document.querySelector('.view[data-view="tickets"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Tickets</div><div class="page-sub" id="tv-sub">SOPORTE · CARGANDO…</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="tv-refresh">↻ Refrescar</button>
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

    async load(){
      try {
        document.getElementById('tv-sub').textContent = 'SOPORTE · CARGANDO…';
        this._tickets = await global.sbGet('v_tickets_overview', 'select=*&order=updated_at.desc.nullslast,created_at.desc&limit=200') || [];
        this.renderKPIs();
        this.renderList();
        document.getElementById('tv-sub').textContent = `SOPORTE · ${this._tickets.length} TICKETS`;
      } catch(err){
        document.getElementById('tv-sub').textContent = 'ERROR · ' + err.message;
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
      if(this._filter === 'all') return this._tickets;
      if(this._filter === 'open')    return this._tickets.filter(t => ['new','open','waiting_customer'].includes(t.status));
      if(this._filter === 'pending') return this._tickets.filter(t => t.status === 'pending');
      if(this._filter === 'resolved') return this._tickets.filter(t => ['resolved','closed'].includes(t.status));
      return this._tickets;
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
              <span class="dim" style="margin-left:auto;">${timeAgo(t.updated_at || t.created_at)}</span>
            </div>
          </div>`;
      }).join('');
    },

    async selectTicket(id){
      const t = this._tickets.find(x => x.id === id);
      if(!t) return;
      this._selected = t;
      this.renderList();
      await this.renderDetail();
    },

    async renderDetail(){
      const t = this._selected;
      if(!t){ return; }
      const detail = document.getElementById('tv-detail');

      // Cargar mensajes
      try {
        this._messages = await global.sbGet('ticket_messages', `ticket_id=eq.${t.id}&select=*&order=created_at.asc`) || [];
      } catch(e){ this._messages = []; }

      const priChip = t.priority === 'urgent' ? '<span class="chip chip-err">URGENT</span>'
                    : t.priority === 'high'   ? '<span class="chip chip-warn">HIGH</span>'
                    : t.priority === 'low'    ? '<span class="chip chip-off">LOW</span>'
                    : '<span class="chip chip-off">NORMAL</span>';
      const statusChip = t.status === 'resolved' || t.status === 'closed'
        ? '<span class="chip chip-ok"><span class="chip-dot"></span>' + (t.status||'').toUpperCase() + '</span>'
        : '<span class="chip chip-warn"><span class="chip-dot"></span>' + (t.status||'NEW').toUpperCase() + '</span>';

      detail.innerHTML = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <strong style="font-size:14px;flex:1;">${escapeHtml(t.subject)}</strong>
            ${priChip}${statusChip}
          </div>
          <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">${escapeHtml(t.requester_name || '')} · ${escapeHtml(t.requester_email)} · ${t.source||'web'}</div>
          <div class="dim" style="font-size:10px;margin-top:3px;">Cliente: ${escapeHtml(t.client_empresa || '—')} · Asignado: ${escapeHtml(t.assignee_name || 'sin asignar')}</div>
        </div>

        <div id="tv-thread" style="flex:1;overflow-y:auto;padding:14px 18px;">
          <div style="padding:12px;background:var(--card2);border-radius:6px;margin-bottom:12px;">
            <div class="dim" style="font-size:10px;margin-bottom:5px;">${escapeHtml(t.requester_name || t.requester_email)} · ${new Date(t.created_at).toLocaleString()}</div>
            <div style="font-size:12px;white-space:pre-wrap;">${escapeHtml(t.body || '')}</div>
          </div>
          ${this._messages.map(m => `
            <div style="padding:12px;background:${m.author_type==='agent' ? 'var(--aria-s)' : 'var(--card2)'};border-radius:6px;margin-bottom:10px;${m.is_internal ? 'border-left:3px solid var(--warn);' : ''}">
              <div class="dim" style="font-size:10px;margin-bottom:5px;">
                ${escapeHtml(m.author_email || m.author_type)} · ${new Date(m.created_at).toLocaleString()}
                ${m.is_internal ? '<span class="chip chip-warn" style="font-size:8px;margin-left:6px;">NOTA INTERNA</span>' : ''}
              </div>
              <div style="font-size:12px;white-space:pre-wrap;">${escapeHtml(m.body)}</div>
            </div>
          `).join('')}
        </div>

        <div style="padding:12px 14px;border-top:1px solid var(--border);">
          <textarea id="tv-reply" placeholder="Escribe tu respuesta…" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:inherit;min-height:70px;resize:vertical;outline:none;"></textarea>
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center;">
            <label style="font-size:10px;color:var(--text3);display:flex;align-items:center;gap:4px;"><input type="checkbox" id="tv-internal"> nota interna</label>
            <div style="margin-left:auto;display:flex;gap:6px;">
              ${t.status !== 'resolved' && t.status !== 'closed' ? `<button class="btn ghost" onclick="TicketsView.resolve('${t.id}')">✓ Resolver</button>` : `<button class="btn ghost" onclick="TicketsView.reopen('${t.id}')">Reabrir</button>`}
              <button class="btn primary" onclick="TicketsView.sendReply('${t.id}')">Enviar</button>
            </div>
          </div>
        </div>
      `;
    },

    async sendReply(ticketId){
      const body = document.getElementById('tv-reply').value.trim();
      if(!body){ global.toast?.('Escribe algo', 'err'); return; }
      const isInternal = document.getElementById('tv-internal').checked;
      try {
        await global.sbInsert('ticket_messages', {
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
        }
        document.getElementById('tv-reply').value = '';
        global.toast?.(isInternal ? 'Nota guardada' : 'Respuesta enviada', 'success');
        await this.load();
        this._selected = this._tickets.find(x => x.id === ticketId) || null;
        await this.renderDetail();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async resolve(id){
      try {
        await global.sbPatch('tickets', id, { status: 'resolved', resolved_at: new Date().toISOString() });
        global.toast?.('Ticket resuelto', 'success');
        await this.load();
        this._selected = this._tickets.find(x => x.id === id);
        await this.renderDetail();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
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
