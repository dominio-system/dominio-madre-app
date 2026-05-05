// ============================================
// Dominio Madre · Vista Documentación (Fase 3)
// ============================================
// Knowledge base con markdown + búsqueda + categorías
(function(global){
  'use strict';

  const DocsView = {
    _articles: [],
    _selected: null,
    _filter: { category: 'all', search: '' },

    async render(){
      const view = document.querySelector('.view[data-view="docs"]');
      if(!view) return;

      view.innerHTML = `
        <div class="page-head">
          <div><div class="page-title">Documentación</div><div class="page-sub" id="dv-sub">SOPORTE · KNOWLEDGE BASE</div></div>
          <div class="page-actions">
            <button class="btn ghost" id="dv-refresh">↻ Refrescar</button>
            <button class="btn primary" id="dv-new">+ Nuevo artículo</button>
          </div>
        </div>

        <div class="kpi-strip">
          <div class="kpi-card"><div class="kpi-label">ARTÍCULOS</div><div class="kpi-value" id="dv-count">—</div><div class="kpi-trend">publicados + drafts</div></div>
          <div class="kpi-card"><div class="kpi-label">PUBLICADOS</div><div class="kpi-value" id="dv-published" style="color:var(--success);">—</div><div class="kpi-trend up">visibles</div></div>
          <div class="kpi-card"><div class="kpi-label">VIEWS TOTAL</div><div class="kpi-value" id="dv-views">—</div><div class="kpi-trend">lectura</div></div>
          <div class="kpi-card"><div class="kpi-label">HELPFUL %</div><div class="kpi-value" id="dv-helpful">—</div><div class="kpi-trend">satisfacción</div></div>
        </div>

        <div style="display:grid;grid-template-columns:280px 1fr;gap:12px;margin-top:12px;height:calc(100vh - 360px);min-height:400px;">
          <!-- LEFT: index -->
          <div class="panel" style="display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:8px;border-bottom:1px solid var(--border);">
              <input id="dv-search" type="text" placeholder="Buscar..." style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:4px;font-size:11px;outline:none;">
            </div>
            <div id="dv-categories" style="padding:8px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:4px;"></div>
            <div id="dv-list" style="flex:1;overflow-y:auto;"></div>
          </div>

          <!-- RIGHT: article -->
          <div class="panel" id="dv-article" style="display:flex;flex-direction:column;overflow:hidden;">
            <div style="padding:40px 20px;text-align:center;color:var(--text3);margin:auto;">
              <div style="font-size:36px;margin-bottom:10px;opacity:0.3;">📖</div>
              <div style="font-size:12px;">Selecciona un artículo o crea uno nuevo</div>
            </div>
          </div>
        </div>
      `;

      document.getElementById('dv-refresh').onclick = () => this.load();
      document.getElementById('dv-new').onclick = () => this.openEditor(null);
      document.getElementById('dv-search').oninput = (e) => { this._filter.search = e.target.value.toLowerCase(); this.renderList(); };
      if(global.RBAC) global.RBAC.disableIfCant(document.getElementById('dv-new'), 'users:rw');

      await this.load();
    },

    async load(){
      try {
        document.getElementById('dv-sub').textContent = 'SOPORTE · CARGANDO…';
        this._articles = await global.sbGet('kb_articles', 'select=*&order=updated_at.desc.nullslast,created_at.desc') || [];
        this.renderKPIs();
        this.renderCategories();
        this.renderList();
        document.getElementById('dv-sub').textContent = `SOPORTE · ${this._articles.length} ARTÍCULOS`;
      } catch(err){
        document.getElementById('dv-sub').textContent = 'ERROR · ' + err.message;
      }
    },

    renderKPIs(){
      const a = this._articles;
      const published = a.filter(x => x.published).length;
      const views = a.reduce((s,x) => s + (x.views||0), 0);
      const helpful = a.reduce((s,x) => s + (x.helpful_count||0), 0);
      const unhelpful = a.reduce((s,x) => s + (x.unhelpful_count||0), 0);
      const total = helpful + unhelpful;
      const pct = total ? Math.round((helpful/total)*100) : 0;

      document.getElementById('dv-count').textContent     = a.length;
      document.getElementById('dv-published').textContent = published;
      document.getElementById('dv-views').textContent     = views.toLocaleString('en');
      document.getElementById('dv-helpful').textContent   = total ? pct + '%' : '—';
    },

    renderCategories(){
      const cats = Array.from(new Set(this._articles.map(a => a.category).filter(Boolean))).sort();
      const container = document.getElementById('dv-categories');
      container.innerHTML = `
        <button class="period-tab ${this._filter.category === 'all' ? 'active' : ''}" data-cat="all" onclick="DocsView.setCategory('all')">Todas</button>
        ${cats.map(c => `<button class="period-tab ${this._filter.category === c ? 'active' : ''}" data-cat="${escapeHtml(c)}" onclick="DocsView.setCategory('${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
      `;
    },

    setCategory(c){
      this._filter.category = c;
      this.renderCategories();
      this.renderList();
    },

    _filtered(){
      let out = this._articles.slice();
      if(this._filter.category !== 'all'){
        out = out.filter(a => a.category === this._filter.category);
      }
      if(this._filter.search){
        const q = this._filter.search;
        out = out.filter(a =>
          (a.title||'').toLowerCase().includes(q) ||
          (a.body_markdown||'').toLowerCase().includes(q) ||
          (a.tags||[]).some(t => t.toLowerCase().includes(q))
        );
      }
      return out;
    },

    renderList(){
      const list = document.getElementById('dv-list');
      const rows = this._filtered();
      if(rows.length === 0){
        list.innerHTML = `<div style="padding:30px 20px;text-align:center;color:var(--text3);font-size:11px;">Sin artículos con este filtro.</div>`;
        return;
      }
      list.innerHTML = rows.map(a => {
        const isSelected = this._selected?.id === a.id;
        return `
          <div onclick="DocsView.select('${a.id}')" style="padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;${isSelected ? 'background:var(--card2);' : ''}">
            <div style="font-size:12px;font-weight:500;margin-bottom:3px;">${escapeHtml(a.title)}${!a.published ? ' <span class="chip chip-warn" style="font-size:8px;padding:1px 4px;">DRAFT</span>' : ''}</div>
            <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;">${escapeHtml(a.slug)}</div>
            <div style="display:flex;gap:6px;font-size:9px;color:var(--text3);margin-top:4px;">
              ${a.category ? `<span>${escapeHtml(a.category)}</span>` : ''}
              <span>${a.views||0} views</span>
              <span style="margin-left:auto;">${(a.helpful_count||0)}👍 · ${(a.unhelpful_count||0)}👎</span>
            </div>
          </div>`;
      }).join('');
    },

    async select(id){
      this._selected = this._articles.find(a => a.id === id);
      this.renderList();
      this.renderArticle();
      // Incrementar views
      if(this._selected){
        try { await global.sbPatch('kb_articles', id, { views: (this._selected.views||0) + 1 }); } catch(e){}
      }
    },

    renderArticle(){
      const a = this._selected;
      if(!a) return;
      const el = document.getElementById('dv-article');
      const canWrite = global.RBAC?.can('users:rw');
      const tagsHtml = (a.tags||[]).map(t => `<span style="font-size:9px;padding:2px 6px;background:var(--card2);border-radius:3px;font-family:'Geist Mono',monospace;">${escapeHtml(t)}</span>`).join(' ');

      el.innerHTML = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:flex-start;gap:10px;">
            <div style="flex:1;">
              <h1 style="font-size:18px;font-weight:600;letter-spacing:-0.3px;">${escapeHtml(a.title)}</h1>
              <div class="dim" style="font-size:10px;font-family:'Geist Mono',monospace;margin-top:4px;">${escapeHtml(a.slug)} · ${a.category || 'sin categoría'} · actualizado ${a.updated_at ? timeAgo(a.updated_at) : timeAgo(a.created_at)}</div>
              <div style="margin-top:6px;">${tagsHtml}</div>
            </div>
            ${canWrite ? `
              <div style="display:flex;gap:6px;">
                <button class="btn ghost" onclick="DocsView.openEditor('${a.id}')">✎ Editar</button>
                <button class="btn ghost" onclick="DocsView.togglePublish('${a.id}')">${a.published ? 'Unpublish' : 'Publish'}</button>
                <button class="btn ghost" onclick="DocsView.deleteArticle('${a.id}')" style="color:var(--danger);">✕</button>
              </div>
            ` : ''}
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 24px;">
          <div style="font-size:14px;line-height:1.7;color:var(--text);" class="dv-markdown">${mdToHtml(a.body_markdown || '')}</div>
          <div style="margin-top:30px;padding:14px;background:var(--card2);border-radius:6px;display:flex;align-items:center;gap:10px;">
            <div style="font-size:12px;color:var(--text2);flex:1;">¿Te fue útil este artículo?</div>
            <button class="btn ghost" onclick="DocsView.vote('${a.id}',true)">👍 ${a.helpful_count||0}</button>
            <button class="btn ghost" onclick="DocsView.vote('${a.id}',false)">👎 ${a.unhelpful_count||0}</button>
          </div>
        </div>
      `;
    },

    async vote(id, helpful){
      const a = this._articles.find(x => x.id === id);
      if(!a) return;
      try {
        await global.sbPatch('kb_articles', id, helpful
          ? { helpful_count: (a.helpful_count||0) + 1 }
          : { unhelpful_count: (a.unhelpful_count||0) + 1 }
        );
        global.toast?.('Gracias por tu feedback', 'success');
        await this.load();
        this._selected = this._articles.find(x => x.id === id);
        this.renderArticle();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    openEditor(id){
      if(!global.RBAC?.can('users:rw')){ global.toast?.('Sin permiso', 'err'); return; }
      const existing = id ? this._articles.find(a => a.id === id) : null;
      const body = `
        <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;">
          <div style="font-size:14px;font-weight:600;">${existing ? 'Editar artículo' : 'Nuevo artículo'}</div>
          <button id="de-close" style="margin-left:auto;width:26px;height:26px;background:transparent;border:0;color:var(--text3);cursor:pointer;">✕</button>
        </div>
        <div style="padding:14px 18px;display:grid;grid-template-columns:2fr 1fr;gap:14px;max-height:70vh;overflow-y:auto;">
          <div>
            <div style="margin-bottom:10px;">
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">TÍTULO *</div>
              <input id="de-title" type="text" value="${escapeHtml(existing?.title||'')}" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:13px;">
            </div>
            <div style="margin-bottom:10px;">
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">SLUG (URL)</div>
              <input id="de-slug" type="text" value="${escapeHtml(existing?.slug||'')}" placeholder="auto-generado si vacío" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;">
            </div>
            <div>
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">BODY (MARKDOWN)</div>
              <textarea id="de-body" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:5px;font-size:12px;font-family:'Geist Mono',monospace;min-height:360px;">${escapeHtml(existing?.body_markdown||'')}</textarea>
            </div>
          </div>
          <div>
            <div style="margin-bottom:10px;">
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">CATEGORÍA</div>
              <input id="de-category" type="text" value="${escapeHtml(existing?.category||'')}" placeholder="Getting Started" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
            </div>
            <div style="margin-bottom:10px;">
              <div class="field-label" style="font-size:9px;letter-spacing:1.5px;color:var(--text3);font-family:'Geist Mono',monospace;margin-bottom:5px;text-transform:uppercase;">TAGS (coma)</div>
              <input id="de-tags" type="text" value="${escapeHtml((existing?.tags||[]).join(', '))}" placeholder="billing, api, howto" style="width:100%;background:var(--card2);border:1px solid var(--border);color:var(--text);padding:8px 10px;border-radius:5px;font-size:12px;">
            </div>
            <label style="display:flex;align-items:center;gap:8px;padding:10px;background:var(--card2);border-radius:5px;cursor:pointer;">
              <input id="de-published" type="checkbox" ${existing?.published ? 'checked' : ''}>
              <span style="font-size:12px;">Publicar (visible públicamente)</span>
            </label>
            <div style="margin-top:14px;padding:10px;background:var(--card2);border-radius:5px;font-size:10px;color:var(--text3);line-height:1.6;">
              <strong style="color:var(--text2);">Markdown soportado:</strong><br>
              • # ## ### headings<br>
              • **bold** *italic*<br>
              • - listas<br>
              • [link](url)<br>
              • \`código\`
            </div>
          </div>
        </div>
        <div style="padding:12px 18px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn ghost" id="de-cancel">Cancelar</button>
          <button class="btn primary" id="de-save">${existing ? 'Guardar' : 'Crear'}</button>
        </div>
      `;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:800;display:flex;align-items:center;justify-content:center;padding:20px;';
      wrap.innerHTML = `<div style="background:var(--card);border:1px solid var(--border2);border-radius:10px;width:100%;max-width:900px;max-height:95vh;overflow:hidden;display:flex;flex-direction:column;">${body}</div>`;
      document.body.appendChild(wrap);

      const close = () => wrap.remove();
      wrap.querySelector('#de-close').onclick = close;
      wrap.querySelector('#de-cancel').onclick = close;
      wrap.querySelector('#de-save').onclick = async () => {
        const title = wrap.querySelector('#de-title').value.trim();
        let slug = wrap.querySelector('#de-slug').value.trim().toLowerCase();
        if(!slug && title) slug = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
        const body_markdown = wrap.querySelector('#de-body').value;
        const category = wrap.querySelector('#de-category').value.trim() || null;
        const tagsStr = wrap.querySelector('#de-tags').value.trim();
        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
        const published = wrap.querySelector('#de-published').checked;

        if(!title){ global.toast?.('Título requerido', 'err'); return; }
        if(!slug){ global.toast?.('Slug requerido', 'err'); return; }

        const payload = { title, slug, body_markdown, category, tags, published, author_id: global.RBAC?._userId || null };
        try {
          if(existing){
            await global.sbPatch('kb_articles', existing.id, payload);
            global.toast?.('Artículo guardado', 'success');
          } else {
            await global.sbInsert('kb_articles', payload);
            global.toast?.('Artículo creado', 'success');
          }
          close();
          await this.load();
          this._selected = this._articles.find(a => a.slug === slug) || null;
          this.renderList();
          this.renderArticle();
        } catch(err){
          global.toast?.('Error: ' + err.message, 'err');
        }
      };
    },

    async togglePublish(id){
      const a = this._articles.find(x => x.id === id);
      if(!a) return;
      try {
        await global.sbPatch('kb_articles', id, { published: !a.published });
        global.toast?.(a.published ? 'Despublicado' : 'Publicado', 'success');
        await this.load();
        this._selected = this._articles.find(x => x.id === id);
        this.renderArticle();
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    },

    async deleteArticle(id){
      if(!confirm('¿Eliminar este artículo? No se puede revertir.')) return;
      try {
        const r = await fetch(`${global.SUPABASE_URL}/rest/v1/kb_articles?id=eq.${id}`, { method:'DELETE', headers: global.sbHeaders() });
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        this._selected = null;
        global.toast?.('Artículo eliminado', 'success');
        await this.load();
        document.getElementById('dv-article').innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text3);margin:auto;"><div style="font-size:36px;margin-bottom:10px;opacity:0.3;">📖</div><div style="font-size:12px;">Selecciona un artículo</div></div>`;
      } catch(err){ global.toast?.('Error: ' + err.message, 'err'); }
    }
  };

  // Minimalist markdown → HTML
  function mdToHtml(md){
    if(!md) return '<div class="dim">(vacío)</div>';
    let h = escapeHtml(md);
    h = h.replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:18px 0 8px;">$1</h3>');
    h = h.replace(/^## (.+)$/gm,  '<h2 style="font-size:17px;font-weight:600;margin:22px 0 10px;">$1</h2>');
    h = h.replace(/^# (.+)$/gm,   '<h1 style="font-size:20px;font-weight:600;margin:26px 0 12px;">$1</h1>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`]+)`/g, '<code style="background:var(--card2);padding:1px 6px;border-radius:3px;font-family:\'Geist Mono\',monospace;font-size:0.9em;">$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--accent);text-decoration:underline;" target="_blank" rel="noopener">$1</a>');
    h = h.replace(/^- (.+)$/gm, '<li style="margin:4px 0 4px 20px;">$1</li>');
    h = h.replace(/(<li[^>]*>.*?<\/li>\n?)+/gs, m => '<ul style="margin:10px 0;">' + m + '</ul>');
    h = h.split(/\n\n+/).map(p => p.startsWith('<') ? p : `<p style="margin:10px 0;">${p.replace(/\n/g,'<br>')}</p>`).join('');
    return h;
  }

  // escapeHtml viene de utils.js (window.escapeHtml). Devuelve '—' para null
  // (antes esta vista devolvía '' — cambio cosmético menor en celdas vacías).
  // timeAgo es local: formato distinto (incluye "hace " para segundos)
  function timeAgo(iso){
    if(!iso) return '';
    const s = Math.floor((Date.now() - new Date(iso).getTime())/1000);
    if(s < 60) return 'hace ' + s + 's';
    if(s < 3600) return 'hace ' + Math.floor(s/60) + 'm';
    if(s < 86400) return 'hace ' + Math.floor(s/3600) + 'h';
    return 'hace ' + Math.floor(s/86400) + 'd';
  }

  global.DocsView = DocsView;
})(window);
