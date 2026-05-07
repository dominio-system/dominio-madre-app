// ============================================
// Dominio Madre · Export CSV utility (v1.0.26 · Enterprise)
// ============================================
// Genera + descarga CSV en el browser sin tocar disco main process.
// Uso desde cualquier vista:
//   MadreExport.csv({
//     filename: 'clientes-2026-05.csv',
//     headers: ['ID','Empresa','Email'],
//     rows: data.map(r => [r.id, r.empresa, r.email]),
//   });
//
// Sanitiza valores que empiezan con = + - @ (CSV injection prevention)
// ============================================

(function(global){
  'use strict';

  function escapeCsvField(v){
    if(v == null) return '';
    let s = String(v);
    // CSV injection prevention: prefijo apóstrofe si empieza con = + - @ TAB CR
    if(/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    // Si contiene coma, quote, newline → wrap con quotes y escape quotes
    if(/[",\n\r]/.test(s)){
      s = '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // v1.0.27 · Garantiza filename único por segundo
  // Patrón final: prefijo + _YYYY-MM-DD_HH-MM-SS + .csv
  // Si el caller pasó una fecha al final (legacy YYYY-MM-DD), la sobreescribe.
  function uniquifyFilename(filename){
    if(!filename) filename = 'export.csv';
    // Quitar extensión .csv si existe
    let base = filename.replace(/\.csv$/i, '');
    // Quitar fecha trailing legacy (-YYYY-MM-DD)
    base = base.replace(/-\d{4}-\d{2}-\d{2}$/, '');
    // Construir timestamp local (no UTC, para que coincida con la zona del usuario)
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `${base}_${stamp}.csv`;
  }

  const MadreExport = {
    csv({ filename, headers, rows }){
      // v1.0.27 · auto-uniquify para evitar colisiones en misma fecha
      filename = uniquifyFilename(filename);
      const lines = [];
      // BOM para que Excel detecte UTF-8
      const bom = '﻿';
      if(Array.isArray(headers) && headers.length){
        lines.push(headers.map(escapeCsvField).join(','));
      }
      (rows || []).forEach(row => {
        if(Array.isArray(row)){
          lines.push(row.map(escapeCsvField).join(','));
        } else if(row && typeof row === 'object' && Array.isArray(headers)){
          lines.push(headers.map(h => escapeCsvField(row[h])).join(','));
        }
      });
      const csv = bom + lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      global.toast?.(`✓ ${filename} descargado · ${rows?.length || 0} filas`, 'success');
    },

    // Helper: genera botón "Export CSV" listo para insertar en una toolbar
    button(onClick){
      return `<button class="btn ghost" onclick='${onClick}' style="font-size:11px;font-family:inherit;" title="Descargar CSV">⬇ CSV</button>`;
    },
  };

  global.MadreExport = MadreExport;
})(window);
