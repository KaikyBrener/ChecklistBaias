import type { Db } from './db.js';
import { ErroDominio } from './errors.js';
import {
  abrirOcorrencia,
  mudarStatus,
  obterOcorrencia,
  registrarEvento,
  type OcorrenciaRow,
  type Severidade,
} from './ocorrencias.js';
import { iso, turnoDe, type TurnoConfig } from './time.js';

export type Resultado = 'OK' | 'DEFEITO' | 'NA';

interface ChecklistRow {
  id: number;
  central_id: number;
  dia_operacional: string;
  turno: 'DIA' | 'NOITE';
  status: 'EM_ANDAMENTO' | 'CONCLUIDO';
  iniciado_por: number;
  iniciado_em: string;
  concluido_em: string | null;
}

interface ItemRow {
  id: number;
  checklist_id: number;
  equipamento_id: number;
  resultado: Resultado;
  severidade: Severidade | null;
  observacao: string;
  efeito: 'ABERTA' | 'CONFIRMADA' | 'RESOLVIDA' | null;
  ocorrencia_id: number | null;
}

const SQL_ABERTA_DO_EQUIPAMENTO = `SELECT * FROM ocorrencias WHERE equipamento_id = ? AND status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA')`;

function obterChecklist(db: Db, id: number): ChecklistRow {
  const c = db.prepare('SELECT * FROM checklists WHERE id = ?').get(id) as ChecklistRow | undefined;
  if (!c) throw new ErroDominio(404, 'Checklist não encontrado.');
  return c;
}

/** Abre (ou retoma) o checklist do turno ATUAL da central. Um por central, dia operacional e turno. */
export function iniciarChecklist(db: Db, centralId: number, usuarioId: number, agora: Date, cfg: TurnoConfig) {
  return db.transaction(() => {
    const central = db.prepare('SELECT id, ativa FROM centrais WHERE id = ?').get(centralId) as { ativa: number } | undefined;
    if (!central) throw new ErroDominio(404, 'Central não encontrada.');
    if (!central.ativa) throw new ErroDominio(409, 'Esta central está desativada.');
    const t = turnoDe(agora, cfg);
    const existente = db
      .prepare('SELECT id FROM checklists WHERE central_id = ? AND dia_operacional = ? AND turno = ?')
      .get(centralId, t.diaOperacional, t.turno) as { id: number } | undefined;
    if (existente) return { id: existente.id, criado: false };
    const r = db
      .prepare(
        `INSERT INTO checklists (central_id, dia_operacional, turno, status, iniciado_por, iniciado_em)
         VALUES (?, ?, ?, 'EM_ANDAMENTO', ?, ?)`,
      )
      .run(centralId, t.diaOperacional, t.turno, usuarioId, iso(agora));
    return { id: Number(r.lastInsertRowid), criado: true };
  })();
}

/** Estado completo do checklist: baias, equipamentos, resposta já dada e ocorrência em aberto de cada um. */
export function detalharChecklist(db: Db, id: number) {
  const cl = db
    .prepare(
      `SELECT k.*, c.nome AS central, u.nome AS iniciado_por_nome
       FROM checklists k JOIN centrais c ON c.id = k.central_id JOIN usuarios u ON u.id = k.iniciado_por WHERE k.id = ?`,
    )
    .get(id) as (ChecklistRow & { central: string; iniciado_por_nome: string }) | undefined;
  if (!cl) throw new ErroDominio(404, 'Checklist não encontrado.');
  const linhas = db
    .prepare(
      `SELECT b.id AS baia_id, b.numero AS baia, e.id AS equipamento_id, e.nome AS equipamento, t.nome AS tipo,
              i.resultado, i.severidade AS item_severidade, i.observacao,
              o.id AS ocorrencia_id, o.severidade AS ocorrencia_severidade, o.status AS ocorrencia_status,
              o.aberta_em AS ocorrencia_aberta_em, o.descricao AS ocorrencia_descricao
       FROM baias b
       JOIN equipamentos e ON e.baia_id = b.id AND e.ativo = 1
       JOIN tipos_equipamento t ON t.id = e.tipo_id
       LEFT JOIN checklist_itens i ON i.equipamento_id = e.id AND i.checklist_id = ?
       LEFT JOIN ocorrencias o ON o.equipamento_id = e.id AND o.status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA')
       WHERE b.central_id = ? AND b.ativa = 1
       ORDER BY b.numero, e.id`,
    )
    .all(id, cl.central_id) as Array<Record<string, unknown>>;

  const baias = new Map<number, { id: number; numero: number; equipamentos: unknown[] }>();
  let respondidos = 0;
  for (const l of linhas) {
    const baiaId = l.baia_id as number;
    if (!baias.has(baiaId)) baias.set(baiaId, { id: baiaId, numero: l.baia as number, equipamentos: [] });
    if (l.resultado) respondidos += 1;
    baias.get(baiaId)!.equipamentos.push({
      id: l.equipamento_id,
      nome: l.equipamento,
      tipo: l.tipo,
      resultado: l.resultado ?? null,
      severidade: l.item_severidade ?? null,
      observacao: l.observacao ?? '',
      ocorrenciaAberta: l.ocorrencia_id
        ? {
            id: l.ocorrencia_id,
            severidade: l.ocorrencia_severidade,
            status: l.ocorrencia_status,
            abertaEm: l.ocorrencia_aberta_em,
            descricao: l.ocorrencia_descricao,
          }
        : null,
    });
  }
  return {
    id: cl.id,
    central: { id: cl.central_id, nome: cl.central },
    diaOperacional: cl.dia_operacional,
    turno: cl.turno,
    status: cl.status,
    iniciadoPor: cl.iniciado_por_nome,
    iniciadoEm: cl.iniciado_em,
    concluidoEm: cl.concluido_em,
    total: linhas.length,
    respondidos,
    baias: [...baias.values()],
  };
}

export interface RespostaItem {
  resultado: Resultado;
  severidade?: Severidade;
  observacao?: string;
}

/**
 * Registra a resposta de um equipamento e aplica o efeito na ocorrência:
 *  - DEFEITO sem ocorrência aberta  -> abre uma (ABERTA)
 *  - DEFEITO com ocorrência aberta  -> só confirma que persiste (não duplica)
 *  - OK com ocorrência aberta       -> resolve ("voltou a funcionar")
 * Corrigir a própria resposta antes de concluir desfaz o efeito anterior quando seguro.
 */
export function responderItem(
  db: Db,
  checklistId: number,
  equipamentoId: number,
  resp: RespostaItem,
  usuarioId: number,
  agora: Date,
): void {
  db.transaction(() => {
    const cl = obterChecklist(db, checklistId);
    if (cl.status !== 'EM_ANDAMENTO') throw new ErroDominio(409, 'Este checklist já foi concluído e não aceita alterações.');
    const eq = db
      .prepare(
        `SELECT e.id, e.ativo, b.ativa AS baia_ativa, b.central_id FROM equipamentos e JOIN baias b ON b.id = e.baia_id WHERE e.id = ?`,
      )
      .get(equipamentoId) as { ativo: number; baia_ativa: number; central_id: number } | undefined;
    if (!eq || eq.central_id !== cl.central_id || !eq.ativo || !eq.baia_ativa) {
      throw new ErroDominio(400, 'Este equipamento não faz parte do checklist desta central.');
    }
    const observacao = (resp.observacao ?? '').trim().slice(0, 500);
    const severidade: Severidade | null = resp.resultado === 'DEFEITO' ? (resp.severidade ?? 'DEGRADADO') : null;

    const anterior = db
      .prepare('SELECT * FROM checklist_itens WHERE checklist_id = ? AND equipamento_id = ?')
      .get(checklistId, equipamentoId) as ItemRow | undefined;
    if (
      anterior &&
      anterior.resultado === resp.resultado &&
      anterior.severidade === severidade &&
      anterior.observacao === observacao
    ) {
      return; // mesma resposta: nada a fazer, nada a registrar
    }

    let efeitoNovo: ItemRow['efeito'] = null;
    let ocorrenciaId: number | null = null;

    // 1) desfaz o efeito da resposta anterior, quando for seguro
    let aberta = db.prepare(SQL_ABERTA_DO_EQUIPAMENTO).get(equipamentoId) as OcorrenciaRow | undefined;
    if (anterior?.ocorrencia_id) {
      const o = obterOcorrencia(db, anterior.ocorrencia_id);
      if (anterior.efeito === 'ABERTA' && o.status === 'ABERTA' && resp.resultado !== 'DEFEITO') {
        mudarStatus(db, o.id, 'CANCELADA', 'Registrado por engano no checklist e corrigido na hora.', usuarioId, agora);
        aberta = undefined;
      } else if (anterior.efeito === 'RESOLVIDA' && o.status === 'RESOLVIDA' && resp.resultado !== 'OK') {
        mudarStatus(db, o.id, 'ABERTA', 'Reaberta: a resposta do checklist foi corrigida.', usuarioId, agora);
        aberta = obterOcorrencia(db, o.id);
      }
    }

    // 2) aplica o efeito da resposta nova
    if (resp.resultado === 'DEFEITO') {
      if (aberta) {
        ocorrenciaId = aberta.id;
        if (anterior?.efeito === 'ABERTA' && anterior.ocorrencia_id === aberta.id) {
          efeitoNovo = 'ABERTA';
          if (aberta.severidade !== severidade || aberta.descricao !== observacao) {
            db.prepare('UPDATE ocorrencias SET severidade = ?, descricao = ? WHERE id = ?').run(severidade, observacao, aberta.id);
            registrarEvento(db, { ocorrenciaId: aberta.id, usuarioId, tipo: 'EDITADA', nota: observacao, agora });
          }
        } else {
          efeitoNovo = 'CONFIRMADA';
          registrarEvento(db, { ocorrenciaId: aberta.id, usuarioId, tipo: 'CONFIRMADA', nota: observacao || 'Defeito persiste (checklist do turno).', agora });
          if (severidade === 'INOPERANTE' && aberta.severidade === 'DEGRADADO') {
            db.prepare("UPDATE ocorrencias SET severidade = 'INOPERANTE' WHERE id = ?").run(aberta.id);
            registrarEvento(db, { ocorrenciaId: aberta.id, usuarioId, tipo: 'SEVERIDADE', nota: 'Agravou: equipamento parou de funcionar.', agora });
          }
        }
      } else {
        ocorrenciaId = abrirOcorrencia(db, {
          equipamentoId,
          severidade: severidade!,
          descricao: observacao,
          usuarioId,
          checklistId,
          turno: cl.turno,
          diaOperacional: cl.dia_operacional,
          agora,
        });
        efeitoNovo = 'ABERTA';
      }
    } else if (resp.resultado === 'OK' && aberta) {
      mudarStatus(db, aberta.id, 'RESOLVIDA', observacao || 'Confirmado funcionando no checklist do turno.', usuarioId, agora);
      ocorrenciaId = aberta.id;
      efeitoNovo = 'RESOLVIDA';
    }

    // 3) grava a resposta
    db.prepare(
      `INSERT INTO checklist_itens (checklist_id, equipamento_id, resultado, severidade, observacao, efeito, ocorrencia_id, registrado_em, registrado_por)
       VALUES (@c, @e, @r, @s, @o, @ef, @oc, @em, @u)
       ON CONFLICT (checklist_id, equipamento_id) DO UPDATE SET
         resultado = @r, severidade = @s, observacao = @o, efeito = @ef, ocorrencia_id = @oc, registrado_em = @em, registrado_por = @u`,
    ).run({ c: checklistId, e: equipamentoId, r: resp.resultado, s: severidade, o: observacao, ef: efeitoNovo, oc: ocorrenciaId, em: iso(agora), u: usuarioId });
  })();
}

/**
 * "Tudo OK" da baia: marca OK só nos equipamentos ainda não respondidos e SEM ocorrência em aberto.
 * Equipamentos com defeito em aberto exigem resposta explícita (persiste ou voltou a funcionar).
 */
export function tudoOkDaBaia(db: Db, checklistId: number, baiaId: number, usuarioId: number, agora: Date) {
  return db.transaction(() => {
    const cl = obterChecklist(db, checklistId);
    if (cl.status !== 'EM_ANDAMENTO') throw new ErroDominio(409, 'Este checklist já foi concluído e não aceita alterações.');
    const baia = db.prepare('SELECT central_id, ativa FROM baias WHERE id = ?').get(baiaId) as { central_id: number; ativa: number } | undefined;
    if (!baia || baia.central_id !== cl.central_id || !baia.ativa) throw new ErroDominio(400, 'Esta baia não faz parte da central do checklist.');
    const alvos = db
      .prepare(
        `SELECT e.id FROM equipamentos e
         WHERE e.baia_id = ? AND e.ativo = 1
           AND NOT EXISTS (SELECT 1 FROM checklist_itens i WHERE i.checklist_id = ? AND i.equipamento_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM ocorrencias o WHERE o.equipamento_id = e.id AND o.status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA'))`,
      )
      .all(baiaId, checklistId) as Array<{ id: number }>;
    for (const a of alvos) responderItem(db, checklistId, a.id, { resultado: 'OK' }, usuarioId, agora);
    const restantes = (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM equipamentos e
           WHERE e.baia_id = ? AND e.ativo = 1
             AND NOT EXISTS (SELECT 1 FROM checklist_itens i WHERE i.checklist_id = ? AND i.equipamento_id = e.id)`,
        )
        .get(baiaId, checklistId) as { n: number }
    ).n;
    return { marcados: alvos.length, restantes };
  })();
}

export function concluirChecklist(db: Db, checklistId: number, agora: Date) {
  return db.transaction(() => {
    const cl = obterChecklist(db, checklistId);
    if (cl.status === 'CONCLUIDO') return;
    const pendentes = db
      .prepare(
        `SELECT b.numero AS baia, e.nome AS equipamento
         FROM equipamentos e JOIN baias b ON b.id = e.baia_id
         WHERE b.central_id = ? AND b.ativa = 1 AND e.ativo = 1
           AND NOT EXISTS (SELECT 1 FROM checklist_itens i WHERE i.checklist_id = ? AND i.equipamento_id = e.id)
         ORDER BY b.numero, e.id`,
      )
      .all(cl.central_id, checklistId) as Array<{ baia: number; equipamento: string }>;
    if (pendentes.length) {
      throw new ErroDominio(409, `Faltam ${pendentes.length} equipamento(s) a responder para concluir.`, { pendentes });
    }
    db.prepare("UPDATE checklists SET status = 'CONCLUIDO', concluido_em = ? WHERE id = ?").run(iso(agora), checklistId);
  })();
}

export function listarChecklists(db: Db, centralId?: number, limite = 60) {
  return db
    .prepare(
      `SELECT k.id, k.central_id, c.nome AS central, k.dia_operacional, k.turno, k.status, k.iniciado_em, k.concluido_em, u.nome AS iniciado_por,
              (SELECT COUNT(*) FROM checklist_itens i WHERE i.checklist_id = k.id AND i.resultado = 'DEFEITO') AS defeitos
       FROM checklists k JOIN centrais c ON c.id = k.central_id JOIN usuarios u ON u.id = k.iniciado_por
       ${centralId ? 'WHERE k.central_id = ?' : ''}
       ORDER BY k.iniciado_em DESC LIMIT ${Math.min(Math.max(limite, 1), 500)}`,
    )
    .all(...(centralId ? [centralId] : []));
}
