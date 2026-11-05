import { partesLocais } from './time.js';

const fmt = (iso: string | null, tz: string) => {
  if (!iso) return '';
  const p = partesLocais(new Date(iso), tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(p.dia)}/${z(p.mes)}/${p.ano} ${z(p.hora)}:${z(p.minuto)}`;
};

/** Evita "injeção de fórmula" ao abrir no Excel: textos que começam com = + - @ ganham um apóstrofo. */
function celula(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ocorrenciasCsv(rows: Array<Record<string, unknown>>, tz: string): string {
  const cab = ['ID', 'Central', 'Baia', 'Equipamento', 'Tipo', 'Severidade', 'Status', 'Aberta em', 'Resolvida em', 'Horas até resolver', 'Turno', 'Dia operacional', 'Aberta por', 'Descrição'];
  const linhas = rows.map((o) => {
    const h = o.resolvida_em ? ((new Date(o.resolvida_em as string).getTime() - new Date(o.aberta_em as string).getTime()) / 3600000).toFixed(1).replace('.', ',') : '';
    return [o.id, o.central, o.baia, o.equipamento, o.tipo, o.severidade, o.status, fmt(o.aberta_em as string, tz), fmt(o.resolvida_em as string | null, tz), h, o.turno, o.dia_operacional, o.aberta_por, o.descricao].map(celula).join(';');
  });
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n') + '\r\n';
}
