// ============================================
// Dominio Madre · Vista "Recursos" (v1.0.16)
// ============================================
// Reemplaza la antigua "Documentación" (CRUD de articles).
// Ahora la KB vive en Notion · esta vista es solo un launcher.
//
// Las URLs de Notion están hardcodeadas para que funcione offline·
// si cambian, actualizar acá. (Workspace privado · no se puede listar via API
// con permisos limitados.)
//
// Las 5 páginas viven bajo:
//   https://www.notion.so/34fc597ee95a8004aae2ed620e4c2ee9
//   "Dominio System · Internal Wiki"
// ============================================

(function(global){
  'use strict';

  const NOTION_PARENT = 'https://www.notion.so/34fc597ee95a8004aae2ed620e4c2ee9';

  const RESOURCES = [
    {
      id: 'runbooks',
      title: 'Runbooks',
      sub: 'Procedimientos paso a paso',
      desc: 'Cómo resolver problemas que ya enfrentamos antes. Quitar quarantine flag, descargar updates, build & release, etc.',
      url: 'https://www.notion.so/358c597ee95a8192b04ff3a57f6a6910',
      icon: 'R',
      count: '4 runbooks',
    },
    {
      id: 'adrs',
      title: 'Decisiones técnicas',
      sub: 'ADRs · Architecture Decision Records',
      desc: 'Por qué tomamos cada decisión arquitectónica. Stack Supabase, LLC Wyoming, Electron vs nativo.',
      url: 'https://www.notion.so/358c597ee95a81ff87f5c4f2e0722e44',
      icon: 'D',
      count: '3 ADRs',
    },
    {
      id: 'onboarding',
      title: 'Onboarding clientes Pro',
      sub: 'Proceso step-by-step',
      desc: 'Checklist de 12 pasos para activar un nuevo cliente Pro. Email de bienvenida, script de training.',
      url: 'https://www.notion.so/358c597ee95a810db2a0e02088f526fb',
      icon: 'O',
      count: '12 pasos',
    },
    {
      id: 'faq',
      title: 'FAQ del equipo',
      sub: 'Preguntas frecuentes',
      desc: 'Para cuando contratemos. Vacío hoy · crece cuando alguien pregunte algo dos veces.',
      url: 'https://www.notion.so/358c597ee95a81a5bc5ef519784e3a4b',
      icon: 'F',
      count: 'plantillas',
    },
    {
      id: 'incidents',
      title: 'Incidents log',
      sub: 'Postmortems',
      desc: 'Historia de incidents resueltos. Lecciones aprendidas para no repetir errores. SOC 2 trail futuro.',
      url: 'https://www.notion.so/358c597ee95a81129096f2f3a9a487cf',
      icon: 'I',
      count: 'plantilla',
    },
  ];

  const DocsView = {
    async render(){
      const view = document.querySelector('.view[data-view="docs"]');
      if(!view) return;

      const cards = RESOURCES.map(r => `
        <div class="panel resource-card" data-rid="${r.id}" style="cursor:pointer;transition:border-color 150ms;display:flex;flex-direction:column;">
          <div style="padding:18px 20px;flex:1;">
            <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:12px;">
              <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--card2),var(--card3));border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--text);font-family:'Geist Mono',monospace;flex-shrink:0;">${r.icon}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:14px;font-weight:600;color:var(--text);line-height:1.3;">${r.title}</div>
                <div style="font-size:10px;color:var(--text3);font-family:'Geist Mono',monospace;text-transform:uppercase;letter-spacing:1px;margin-top:3px;">${r.sub}</div>
              </div>
              <span class="chip" style="font-size:9px;">${r.count}</span>
            </div>
            <div style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:14px;">${r.desc}</div>
          </div>
          <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:10px;color:var(--text3);font-family:'Geist Mono',monospace;">notion.so</span>
            <span style="font-size:11px;color:var(--accent);">Abrir →</span>
          </div>
        </div>
      `).join('');

      view.innerHTML = `
        <div class="page-head">
          <div>
            <div class="page-title">Recursos</div>
            <div class="page-sub">WIKI INTERNA · ALOJADA EN NOTION</div>
          </div>
          <div class="page-actions">
            <button class="btn ghost" id="rv-open-parent">Abrir wiki principal ↗</button>
            <button class="btn primary" id="rv-new-doc">+ Nuevo documento</button>
          </div>
        </div>

        <div class="panel" style="margin-bottom:14px;padding:14px 18px;display:flex;align-items:center;gap:12px;background:var(--info-s);border-color:rgba(138,154,168,0.2);">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--info-s);border:1px solid rgba(138,154,168,0.3);color:var(--info);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;font-family:'Geist Mono',monospace;flex-shrink:0;">i</div>
          <div style="flex:1;font-size:11px;line-height:1.6;color:var(--text2);">
            La base de conocimiento del equipo vive en Notion. Click en cualquier card abre la sección correspondiente en el navegador. Ver Notion en <strong>app móvil, browser, o desktop</strong> · sincroniza automático.
          </div>
        </div>

        <div class="grid grid-3" id="rv-cards" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;">
          ${cards}
        </div>

        <div class="panel" style="margin-top:18px;padding:14px 18px;font-size:11px;line-height:1.7;color:var(--text3);">
          <strong style="color:var(--text2);">Convención:</strong> escribí un runbook cuando un problema te muerda 2 veces. Escribí un ADR cuando dudes una decisión técnica. Escribí en FAQ cuando alguien del equipo pregunte algo dos veces. <strong style="color:var(--text2);">No fuerces el sistema · dejá que crezca cuando duela.</strong>
        </div>
      `;

      // Click handlers
      view.querySelectorAll('.resource-card').forEach(card => {
        const rid = card.dataset.rid;
        const r = RESOURCES.find(x => x.id === rid);
        if(!r) return;
        card.addEventListener('click', () => {
          if(global.electronAPI?.openExternal){
            global.electronAPI.openExternal(r.url);
            global.toast?.(`Abriendo "${r.title}" en Notion…`, 'info', 2000);
          } else {
            window.open(r.url, '_blank');
          }
        });
        card.addEventListener('mouseenter', () => { card.style.borderColor = 'var(--border2)'; });
        card.addEventListener('mouseleave', () => { card.style.borderColor = 'var(--border)'; });
      });

      document.getElementById('rv-open-parent')?.addEventListener('click', () => {
        global.electronAPI?.openExternal?.(NOTION_PARENT) || window.open(NOTION_PARENT, '_blank');
      });
      document.getElementById('rv-new-doc')?.addEventListener('click', () => {
        // Notion no tiene URL para "crear página nueva en workspace X"  · abrimos el parent
        // El usuario crea desde ahí
        global.electronAPI?.openExternal?.(NOTION_PARENT) || window.open(NOTION_PARENT, '_blank');
        global.toast?.('Crea la página nueva dentro del wiki principal', 'info', 3000);
      });
    },
  };

  global.DocsView = DocsView;
})(window);
