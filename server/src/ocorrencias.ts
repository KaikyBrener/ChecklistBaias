import type { Db } from './db.js';
import { ErroDominio } from './errors.js';
import type { Papel } from './auth.js';
import { iso, type Turno } from './time.js';

export type StatusOcorrencia = 'ABERTA' | 'EM_MANUTENCAO' | 'AGUARDANDO_PECA' | 'RESOLVIDA' | 'CANCELADA';
export type Severidade = 'DEGRADADO' | 'INOPERANTE';

export interface OcorrenciaRow {
  id: number;
  equipamento_id: number;
  severidade: Severidade;
  descricao: string;
  status: StatusOcorrencia;
  aberta_em: string;
  aberta_por: number;
  checklist_id: number | null;
  turno: Turno;
  dia_operacional: string;
  resolvida_em: string | null;
}

export type TipoEvento =
  | 'ABERTA'
  | 'CONFIRMADA'
  | 'STATUS'
  | 'RESOLVIDA'
  | 'REABERTA'
  | 'CANCELADA'
  | 'SEVERIDADE'
  | 'EDITADA'
  | 'NOTA';

const TRANSICOES: Record<StatusOcorrencia, StatusOcorrencia[]> = {
  ABERTA: ['EM_MANUTENCAO', 'AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA'],
  EM_MANUTENCAO: ['AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_MANUTENCAO', 'RESOLVIDA', 'CANCELADA'],
  RESOLVIDA: ['ABERTA'],
  CANCELADA: [],
};

export const ROTULO_STATUS: Record<StatusOcorrencia, string> = {
  ABERTA: 'Aberta',
  EM_MANUTENCAO: 'Em manutenção',
  AGUARDANDO_PECA: 'Aguardando peça',
  RESOLVIDA: 'Resolvida',
  CANCELADA: 'Cancelada',
};

export function registrarEvento(
  db: Db,
  e: {
    ocorrenciaId: number;
    usuarioId: number;
    tipo: TipoEvento;
    de?: StatusOcorrencia | null;
    para?: StatusOcorrencia | null;
    nota?: string;
    agora: Date;
  },
): void {
  db.prepare(
    `INSERT INTO ocorrencia_eventos (ocorrencia_id, em, usuario_id, tipo, de_status, para_status, nota)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(e.ocorrenciaId, iso(e.agora), e.usuarioId, e.tipo, e.de ?? null, e.para ?? null, (e.nota ?? '').trim());
}

export function abrirOcorrencia(
  db: Db,
  p: {
    equipamentoId: number;
    severidade: Severidade;
    descricao: string;
    usuarioId: number;
    checklistId: number | null;
    turno: Turno;
    diaOperacional: string;
    agora: Date;
  },
): number {
  const r = db
    .prepare(
      `INSERT INTO ocorrencias (equipamento_id, severidade, descricao, status, aberta_em, aberta_por, checklist_id, turno, dia_operacional)
       VALUES (?, ?, ?, 'ABERTA', ?, ?, ?, ?, ?)`,
    )
    .run(p.equipamentoId, p.severidade, p.descricao.trim(), iso(p.agora), p.usuarioId, p.checklistId, p.turno, p.diaOperacional);
  const id = Number(r.lastInsertRowid);
  registrarEvento(db, { ocorrenciaId: id, usuarioId: p.usuarioId, tipo: 'ABERTA', para: 'ABERTA', nota: p.descricao, agora: p.agora });
  return id;
}

export function obterOcorrencia(db: Db, id: number): OcorrenciaRow {
  const o = db.prepare('SELECT * FROM ocorrencias WHERE id = ?').get(id) as OcorrenciaRow | undefined;
  if (!o) throw new ErroDominio(404, 'Ocorrência não encontrada.');
  return o;
}

/** Troca o status respeitando as transições permitidas e grava o evento no log. */
export function mudarStatus(
  db: Db,
  id: number,
  para: StatusOcorrencia,
  nota: string,
  usuarioId: number,
  agora: Date,
  opcoes: { tipoEvento?: TipoEvento } = {},
): OcorrenciaRow {
  return db.transaction(() => {
    const o = obterOcorrencia(db, id);
    if (!TRANSICOES[o.status].includes(para)) {
      throw new ErroDominio(409, `Não é possível passar de "${ROTULO_STATUS[o.status]}" para "${ROTULO_STATUS[para]}".`);
    }
    if (para === 'CANCELADA' && nota.trim().length < 3) {
      throw new ErroDominio(400, 'Explique em poucas palavras o motivo do cancelamento.');
    }
    const tipo: TipoEvento =
      opcoes.tipoEvento ??
      (para === 'RESOLVIDA' ? 'RESOLVIDA' : para === 'CANCELADA' ? 'CANCELADA' : o.status === 'RESOLVIDA' ? 'REABERTA' : 'STATUS');
    const resolvidaEm = para === 'RESOLVIDA' ? iso(agora) : null;
    try {
      db.prepare('UPDATE ocorrencias SET status = ?, resolvida_em = ? WHERE id = ?').run(para, resolvidaEm, id);
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) {
        throw new ErroDominio(409, 'Este equipamento já tem outra ocorrência em aberto. Resolva ou cancele a outra antes de reabrir esta.');
      }
      throw e;
    }
    registrarEvento(db, { ocorrenciaId: id, usuarioId, tipo, de: o.status, para, nota, agora });
    return obterOcorrencia(db, id);
  })();
}

export function adicionarNota(db: Db, id: number, nota: string, usuarioId: number, agora: Date): void {
  const texto = nota.trim();
  if (texto.length < 2) throw new ErroDominio(400, 'Escreva a observação.');
  obterOcorrencia(db, id);
  registrarEvento(db, { ocorrenciaId: id, usuarioId, tipo: 'NOTA', nota: texto, agora });
}

export function podeMudarStatus(papel: Papel): boolean {
  return papel === 'TI' || papel === 'ADMIN';
}

const SELECT_LISTA = `
  SELECT o.id, o.status, o.severidade, o.descricao, o.aberta_em, o.resolvida_em, o.turno, o.dia_operacional,
         e.id AS equipamento_id, e.nome AS equipamento, t.nome AS tipo,
         b.id AS baia_id, b.numero AS baia, c.id AS central_id, c.nome AS central,
         u.nome AS aberta_por
  FROM ocorrencias o
  JOIN equipamentos e ON e.id = o.equipamento_id
  JOIN tipos_equipamento t ON t.id = e.tipo_id
  JOIN baias b ON b.id = e.baia_id
  JOIN centrais c ON c.id = b.central_id
  JOIN usuarios u ON u.id = o.aberta_por`;

export interface FiltroOcorrencias {
  situacao?: 'abertas' | 'encerradas' | 'todas';
  centralId?: number;
  desde?: string;
  limite?: number;
}

export function listarOcorrencias(db: Db, f: FiltroOcorrencias = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.situacao === 'abertas') where.push("o.status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA')");
  if (f.situacao === 'encerradas') where.push("o.status IN ('RESOLVIDA','CANCELADA')");
  if (f.centralId) {
    where.push('c.id = ?');
    params.push(f.centralId);
  }
  if (f.desde) {
    where.push('o.aberta_em >= ?');
    params.push(f.desde);
  }
  const limite = Math.min(Math.max(f.limite ?? 200, 1), 5000);
  return db
    .prepare(`${SELECT_LISTA} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.aberta_em DESC LIMIT ${limite}`)
    .all(...params);
}

export function detalheOcorrencia(db: Db, id: number) {
  const o = db.prepare(`${SELECT_LISTA} WHERE o.id = ?`).get(id);
  if (!o) throw new ErroDominio(404, 'Ocorrência não encontrada.');
  const eventos = db
    .prepare(
      `SELECT ev.id, ev.em, ev.tipo, ev.de_status, ev.para_status, ev.nota, u.nome AS usuario
       FROM ocorrencia_eventos ev JOIN usuarios u ON u.id = ev.usuario_id
       WHERE ev.ocorrencia_id = ? ORDER BY ev.id`,
    )
    .all(id);
  return { ...(o as object), eventos };
}
