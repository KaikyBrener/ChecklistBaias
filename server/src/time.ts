/**
 * Turnos e "dia operacional".
 *
 * Operação 24h com dois turnos (DIA e NOITE). O turno da NOITE atravessa a meia-noite:
 * a parte depois das 00:00 pertence ao dia operacional em que a noite COMEÇOU.
 * Ex.: 03:00 de terça, com a noite começando às 19:00, é NOITE do dia operacional de segunda.
 */
export type Turno = 'DIA' | 'NOITE';

export interface TurnoConfig {
  tz: string;
  /** hora cheia (0-23) em que o turno DIA começa */
  diaInicioHora: number;
  /** hora cheia (0-23) em que o turno NOITE começa; precisa ser maior que diaInicioHora */
  noiteInicioHora: number;
}

export const turnoConfigPadrao: TurnoConfig = {
  tz: 'America/Sao_Paulo',
  diaInicioHora: 7,
  noiteInicioHora: 19,
};

export interface TurnoInfo {
  diaOperacional: string; // YYYY-MM-DD
  turno: Turno;
  inicio: Date;
  fim: Date;
}

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(tz: string): Intl.DateTimeFormat {
  let f = formatadores.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatadores.set(tz, f);
  }
  return f;
}

export function partesLocais(data: Date, tz: string) {
  const mapa: Record<string, number> = {};
  for (const p of formatador(tz).formatToParts(data)) {
    if (p.type !== 'literal') mapa[p.type] = Number(p.value);
  }
  return {
    ano: mapa.year as number,
    mes: mapa.month as number,
    dia: mapa.day as number,
    hora: mapa.hour as number,
    minuto: mapa.minute as number,
  };
}

function deslocamentoMin(data: Date, tz: string): number {
  const p = partesLocais(data, tz);
  const t = Math.floor(data.getTime() / 1000) * 1000;
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, data.getUTCSeconds());
  return Math.round((comoUtc - t) / 60000);
}

/** Converte "AAAA-MM-DD hh:mm" no fuso `tz` para o instante UTC correspondente. */
export function localParaUtc(ymd: string, hora: number, minuto: number, tz: string): Date {
  const [a, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const chute = Date.UTC(a, m - 1, d, hora, minuto);
  const off1 = deslocamentoMin(new Date(chute), tz);
  let r = chute - off1 * 60000;
  const off2 = deslocamentoMin(new Date(r), tz);
  if (off2 !== off1) r = chute - off2 * 60000;
  return new Date(r);
}

const pad = (n: number) => String(n).padStart(2, '0');

export function somarDias(ymd: string, dias: number): string {
  const [a, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function validarConfig(cfg: TurnoConfig): void {
  const ok = (h: number) => Number.isInteger(h) && h >= 0 && h <= 23;
  if (!ok(cfg.diaInicioHora) || !ok(cfg.noiteInicioHora) || cfg.diaInicioHora >= cfg.noiteInicioHora) {
    throw new Error('Configuração de turnos inválida: o início do DIA deve ser menor que o início da NOITE (horas 0-23).');
  }
  try {
    formatador(cfg.tz).format(new Date());
  } catch {
    throw new Error(`Fuso horário inválido: ${cfg.tz}`);
  }
}

export function inicioDoTurno(diaOperacional: string, turno: Turno, cfg: TurnoConfig): Date {
  const hora = turno === 'DIA' ? cfg.diaInicioHora : cfg.noiteInicioHora;
  return localParaUtc(diaOperacional, hora, 0, cfg.tz);
}

export function fimDoTurno(diaOperacional: string, turno: Turno, cfg: TurnoConfig): Date {
  return turno === 'DIA'
    ? inicioDoTurno(diaOperacional, 'NOITE', cfg)
    : inicioDoTurno(somarDias(diaOperacional, 1), 'DIA', cfg);
}

export function turnoDe(data: Date, cfg: TurnoConfig): TurnoInfo {
  const p = partesLocais(data, cfg.tz);
  const ymd = `${p.ano}-${pad(p.mes)}-${pad(p.dia)}`;
  let turno: Turno;
  let diaOperacional: string;
  if (p.hora >= cfg.diaInicioHora && p.hora < cfg.noiteInicioHora) {
    turno = 'DIA';
    diaOperacional = ymd;
  } else if (p.hora >= cfg.noiteInicioHora) {
    turno = 'NOITE';
    diaOperacional = ymd;
  } else {
    turno = 'NOITE';
    diaOperacional = somarDias(ymd, -1);
  }
  return {
    diaOperacional,
    turno,
    inicio: inicioDoTurno(diaOperacional, turno, cfg),
    fim: fimDoTurno(diaOperacional, turno, cfg),
  };
}

/** Turnos que já terminaram entre `de` e `ate` (inclusive os que começaram antes de `de`? não: só os que começam em/depois de `de`). */
export function turnosEncerradosEntre(de: Date, ate: Date, cfg: TurnoConfig): TurnoInfo[] {
  const lista: TurnoInfo[] = [];
  let atual = turnoDe(de, cfg);
  if (atual.inicio.getTime() < de.getTime()) atual = proximoTurno(atual, cfg);
  while (atual.fim.getTime() <= ate.getTime()) {
    lista.push(atual);
    atual = proximoTurno(atual, cfg);
  }
  return lista;
}

export function proximoTurno(t: TurnoInfo, cfg: TurnoConfig): TurnoInfo {
  const turno: Turno = t.turno === 'DIA' ? 'NOITE' : 'DIA';
  const dia = t.turno === 'DIA' ? t.diaOperacional : somarDias(t.diaOperacional, 1);
  return { diaOperacional: dia, turno, inicio: inicioDoTurno(dia, turno, cfg), fim: fimDoTurno(dia, turno, cfg) };
}

export const iso = (d: Date) => d.toISOString();
