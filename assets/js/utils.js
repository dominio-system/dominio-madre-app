// ============================================
// Dominio Madre · Utils compartidos (Fase 1 polish v1.0.10)
// ============================================
// Helpers reutilizables por TODAS las vistas.
// Se carga ANTES de los *-view.js en dashboard-madre.html.
//
// v1.0.10 · agregados:
//   · formatTimestamps()    auto-formatea elementos con [data-ts] o class="ts-iso"
//   · emptyState()          componente reusable para tablas/paneles vacíos
//   · skeletonRows(n,cols)  loading skeleton para tbodies
//   · loadingState()/errorState()  paneles de estado consistentes
// ============================================

(function(global){
  'use strict';

  // ─── Paleta de estados ───
  const COLORS = Object.freeze({
    success: '#6fcf97',
    danger:  '#eb5757',
    warn:    '#c9a878',  // beige (paleta cliente v2.2.6)
    warn2:   '#f2994a',
    info:    '#8a9aa8',  // gris azulado (paleta cliente)
    muted:   '#888',
  });

  // ─── HTML escape ───
  function escapeHtml(s){
    if(s == null) return '—';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ─── Tiempo relativo (es-MX) ───
  function relativeTime(iso, opts){
    if(!iso) return '—';
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      if(diff < 0) return 'futuro';
      if(diff < 60_000) return 'ahora';
      if(diff < 3600_000) return `hace ${Math.floor(diff/60_000)}m`;
      if(diff < 86400_000) return `hace ${Math.floor(diff/3600_000)}h`;
      if(diff < 86400_000 * 7) return `hace ${Math.floor(diff/86400_000)}d`;
      const fmt = { day:'numeric', month:'short' };
      if(!opts || opts.includeYear !== false) fmt.year = 'numeric';
      return d.toLocaleDateString('es-MX', fmt);
    } catch { return '—'; }
  }

  // ─── Tiempo absoluto en TZ activo (lo usa tooltips con title) ───
  function absoluteTime(iso){
    if(!iso) return '—';
    try {
      const tz = global.MadreTZ?.getActiveTZ?.() || undefined;
      return new Date(iso).toLocaleString('es-MX', {
        day:'2-digit', month:'short', year:'numeric',
        hour:'2-digit', minute:'2-digit', timeZone:tz
      });
    } catch { return iso; }
  }

  // ─── Auto-formatear timestamps en el DOM ───
  // Busca elementos con `data-ts="<iso>"` o `<time datetime="<iso>">`
  // Pone `relativeTime()` como text + `absoluteTime()` como title (tooltip)
  // Llamar después de re-render: `MadreUtils.formatTimestamps(rootEl)`
  function formatTimestamps(rootEl){
    const root = rootEl || document;
    const els = root.querySelectorAll('[data-ts], time[datetime]');
    els.forEach(el => {
      const iso = el.dataset.ts || el.getAttribute('datetime');
      if(!iso) return;
      el.textContent = relativeTime(iso);
      if(!el.title || /^\d{4}-\d{2}-\d{2}/.test(el.title)){
        el.title = absoluteTime(iso);
      }
    });
  }

  // Re-render todas las relativetimes cada minuto (para que "hace 5m" se actualice a "hace 6m")
  setInterval(() => formatTimestamps(), 60_000);

  // ─── Empty state reusable ───
  // Uso: tbody.innerHTML = `<tr><td colspan="N">${emptyState({ icon, title, body, action })}</td></tr>`
  function emptyState(opts){
    const o = opts || {};
    const icon = o.icon || '○';
    const title = o.title || 'Sin datos';
    const body = o.body || '';
    const action = o.action || '';
    return `
      <div style="text-align:center;padding:48px 24px;display:flex;flex-direction:column;align-items:center;gap:10px;">
        <div style="width:48px;height:48px;border-radius:12px;background:var(--card2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--text3);">${icon}</div>
        <div style="font-size:13px;font-weight:500;color:var(--text2);">${escapeHtml(title)}</div>
        ${body ? `<div style="font-size:11px;color:var(--text4);line-height:1.5;max-width:300px;">${escapeHtml(body)}</div>` : ''}
        ${action ? `<div style="margin-top:6px;">${action}</div>` : ''}
      </div>
    `;
  }

  // ─── Skeleton rows (loading state para tbodies) ───
  function skeletonRows(n, cols){
    n = n || 5;
    cols = cols || 4;
    let rows = '';
    for(let i = 0; i < n; i++){
      rows += `<tr><td colspan="${cols}" style="padding:0;"><div class="skeleton-row" style="height:36px;background:var(--card2);border-bottom:1px solid var(--border);position:relative;overflow:hidden;"></div></td></tr>`;
    }
    return rows;
  }

  // ─── Error state (tabla/panel) ───
  function errorState(err, retry){
    const msg = err?.message || String(err || 'desconocido');
    return `
      <div style="text-align:center;padding:36px 24px;display:flex;flex-direction:column;align-items:center;gap:10px;">
        <div style="width:42px;height:42px;border-radius:11px;background:var(--danger-s);color:var(--danger);border:1px solid rgba(235,87,87,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;">!</div>
        <div style="font-size:12px;font-weight:500;color:var(--danger);">Error al cargar</div>
        <div style="font-size:10px;color:var(--text4);font-family:'Geist Mono',monospace;max-width:380px;line-height:1.5;">${escapeHtml(msg)}</div>
        ${retry ? `<button class="btn primary" style="font-size:11px;margin-top:6px;" onclick="${retry}">Reintentar</button>` : ''}
      </div>
    `;
  }

  // ─── Reset listeners ───
  function resetNodeListeners(node){
    if(!node || !node.parentNode) return node;
    const clone = node.cloneNode(true);
    node.parentNode.replaceChild(clone, node);
    return clone;
  }

  // ─── Inject skeleton shimmer + states CSS one-shot ───
  if(!document.getElementById('madre-utils-css')){
    const style = document.createElement('style');
    style.id = 'madre-utils-css';
    style.textContent = `
      .skeleton-row::after{
        content:''; position:absolute; inset:0;
        background:linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent);
        animation:madre-shimmer 1.4s infinite;
      }
      @keyframes madre-shimmer{
        0%{transform:translateX(-100%);}
        100%{transform:translateX(100%);}
      }
    `;
    document.head.appendChild(style);
  }

  global.MadreUtils = {
    COLORS, escapeHtml, relativeTime, absoluteTime,
    formatTimestamps, emptyState, skeletonRows, errorState,
    resetNodeListeners,
  };

  // Aliases globales (no romper código existente)
  if(typeof global.escapeHtml === 'undefined') global.escapeHtml = escapeHtml;
  if(typeof global.relativeTime === 'undefined') global.relativeTime = relativeTime;
})(window);
