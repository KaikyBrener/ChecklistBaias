export type Papel = 'ADMIN' | 'TI' | 'COORDENADOR' | 'GERENTE';
export type Status = 'ABERTA' | 'EM_MANUTENCAO' | 'AGUARDANDO_PECA' | 'RESOLVIDA' | 'CANCELADA';
export type Severidade = 'DEGRADADO' | 'INOPERANTE';

export interface Usuario { id: number; nome: string; papel: Papel }
export interface Sessao {
  usuario: Usuario; demo: boolean; tz: string; prazoChecklistMin: number;
  turnoAtual: { turno: 'DIA' | 'NOITE'; diaOperacional: string; inicio: string; fim: string };
}

export class ErroApi extends Error {
  constructor(public status: number, message: string, public detalhes?: any) { super(message); }
}

export async function api<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch('/api' + caminho, {
    method: metodo,
    credentials: 'same-origin',
    headers: { 'X-Requested-With': 'checklist-baias', ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text();
  const dados = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new ErroApi(r.status, dados?.erro ?? 'Algo deu errado. Tente de novo.', dados?.detalhes);
  return dados as T;
}
export const get = <T = any>(c: string) => api<T>('GET', c);
export const post = <T = any>(c: string, b: unknown = {}) => api<T>('POST', c, b);
export const put = <T = any>(c: string, b: unknown) => api<T>('PUT', c, b);
export const patch = <T = any>(c: string, b: unknown) => api<T>('PATCH', c, b);

export const STATUS_ROTULO: Record<Status, string> = {
  ABERTA: 'Aberta', EM_MANUTENCAO: 'Em manutenção', AGUARDANDO_PECA: 'Aguardando peça', RESOLVIDA: 'Resolvida', CANCELADA: 'Cancelada',
};
export const SEV_ROTULO: Record<Severidade, string> = { DEGRADADO: 'Com problema', INOPERANTE: 'Parado' };
export const PAPEL_ROTULO: Record<Papel, string> = { ADMIN: 'Administrador', TI: 'TI', COORDENADOR: 'Coordenador', GERENTE: 'Gerente' };

export function fmtData(iso: string, tz: string, so: 'data' | 'hora' | 'ambos' = 'ambos'): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: tz };
  if (so !== 'hora') Object.assign(opts, { day: '2-digit', month: '2-digit' });
  if (so !== 'data') Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: false });
  return new Intl.DateTimeFormat('pt-BR', opts).format(d).replace(',', '');
}
export function fmtDur(horas: number | null | undefined): string {
  if (horas == null) return '–';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${horas.toFixed(horas < 10 ? 1 : 0).replace('.', ',')} h`;
  return `${Math.floor(horas / 24)} d ${Math.round(horas % 24)} h`;
}
export function desde(iso: string, agora = Date.now()): number { return (agora - new Date(iso).getTime()) / 3600000; }
