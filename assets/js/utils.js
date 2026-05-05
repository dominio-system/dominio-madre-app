// ============================================
// Dominio Madre · Utils compartidos (Fase 3/4/5 v1.0.7)
// ============================================
// Helpers reutilizables por todas las vistas.
// Se carga ANTES de los *-view.js en dashboard-madre.html.
//
// Antes de Fase 2 cada vista duplicaba escapeHtml/relativeTime y hardcodeaba
// colores. Ahora una sola fuente de verdad → menos drift, bundle más chico.
// ============================================

(function(global){
  'use strict';

  // ─── Paleta de estados (hex literales para que funcione en style="...") ───
  const COLORS = Object.freeze({
    success: '#6fcf97',
    danger:  '#eb5757',
    warn:    '#f2c94c',
    warn2:   '#f2994a',  // intermedio entre warn y danger (sev2, identified)
    info:    '#56ccf2',
    muted:   '#888',
  });

  // ─── HTML escape ───
  // null/undefined → '—' (em-dash) por convención del codebase (mayoría de
  //   las vistas mostraban un guión cuando el dato era nulo).
  // Si quieres otra cosa, pásalo explícito: `escapeHtml(s ?? '')`
  function escapeHtml(s){
    if(s == null) return '—';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  // ─── Tiempo relativo (es-MX) ───
  // opts.includeYear=true → muestra año en fechas viejas (default true)
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

  // ─── Reemplaza un nodo por un clone para limpiar TODOS sus listeners.
  //     Útil cuando re-renderizas filter chips y no quieres acumular handlers.
  function resetNodeListeners(node){
    if(!node || !node.parentNode) return node;
    const clone = node.cloneNode(true);
    node.parentNode.replaceChild(clone, node);
    return clone;
  }

  global.MadreUtils = { COLORS, escapeHtml, relativeTime, resetNodeListeners };

  // Aliases globales para no romper código existente que llama a window.escapeHtml
  if(typeof global.escapeHtml === 'undefined') global.escapeHtml = escapeHtml;
  if(typeof global.relativeTime === 'undefined') global.relativeTime = relativeTime;
})(window);
