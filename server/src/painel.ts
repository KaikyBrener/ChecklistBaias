import type { Db } from './db.js';
import { partesLocais, turnoDe, turnosEncerradosEntre, type TurnoConfig } from './time.js';

export interface ConfigApp {
  turno: TurnoConfig;
  /** minutos após o início do turno em que o checklist ainda conta como "no prazo" */
  prazoChecklistMin: number;
}

const OPEN = `('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA')`;
const HORA = 3600 * 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;

function diaLocal(d: Date, tz: string): string {
  const p = partesLocais(d, tz);
  return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

export function montarPainel(db: Db, agora: Date, cfg: ConfigApp, dias: number) {
  const desde = new Date(agora.getTime() - dias * 24 * HORA);
  const desdeIso = desde.toISOString();

  // ---- estado atual: mapa de baias por central ----
  const centrais = db.prepare('SELECT id, nome FROM centrais WHERE ativa = 1 ORDER BY nome').all() as Array<{ id: number; nome: string }>;
  const abertas = db
    .prepare(
      `SELECT o.id, o.severidade, o.status, o.aberta_em, e.nome AS equipamento, t.nome AS tipo, b.id AS baia_id, b.numero AS baia, b.central_id
       FROM ocorrencias o JOIN equipamentos e ON e.id = o.equipamento_id JOIN tipos_equipamento t ON t.id = e.tipo_id
       JOIN baias b ON b.id = e.baia_id WHERE o.status IN ${OPEN}`,
    )
    .all() as Array<{ id: number; severidade: string; status: string; aberta_em: string; equipamento: string; tipo: string; baia_id: number; baia: number; central_id: number }>;
  const baiasAtivas = db
    .prepare('SELECT id, numero, central_id FROM baias WHERE ativa = 1 ORDER BY central_id, numero')
    .all() as Array<{ id: number; numero: number; central_id: number }>;

  const mapa = centrais.map((c) => {
    const baias = baiasAtivas
      .filter((b) => b.central_id === c.id)
      .map((b) => {
        const abs = abertas.filter((o) => o.baia_id === b.id);
        const estado = abs.some((o) => o.severidade === 'INOPERANTE') ? 'INOPERANTE' : abs.length ? 'ATENCAO' : 'OK';
        return {
          id: b.id,
          numero: b.numero,
          estado,
          abertas: abs.map((o) => ({ id: o.id, equipamento: o.equipamento, severidade: o.severidade, status: o.status, desde: o.aberta_em })),
        };
      });
    const doCentral = abertas.filter((o) => o.central_id === c.id);
    return {
      id: c.id,
      nome: c.nome,
      abertas: doCentral.length,
      inoperantes: doCentral.filter((o) => o.severidade === 'INOPERANTE').length,
      baiasComProblema: baias.filter((b) => b.estado !== 'OK').length,
      baias,
    };
  });

  // ---- período ----
  const doPeriodo = db
    .prepare(
      `SELECT o.id, o.status, o.aberta_em, o.resolvida_em, o.turno, o.dia_operacional, o.equipamento_id,
              t.nome AS tipo, b.numero AS baia, c.nome AS central, e.nome AS equipamento
       FROM ocorrencias o JOIN equipamentos e ON e.id = o.equipamento_id JOIN tipos_equipamento t ON t.id = e.tipo_id
       JOIN baias b ON b.id = e.baia_id JOIN centrais c ON c.id = b.central_id
       WHERE o.status <> 'CANCELADA' AND (o.aberta_em >= ? OR o.resolvida_em >= ?)`,
    )
    .all(desdeIso, desdeIso) as Array<{ id: number; status: string; aberta_em: string; resolvida_em: string | null; turno: string; dia_operacional: string; equipamento_id: number; tipo: string; baia: number; central: string; equipamento: string }>;
  const abertasNoPeriodo = doPeriodo.filter((o) => o.aberta_em >= desdeIso);
  const resolvidasNoPeriodo = doPeriodo.filter((o) => o.status === 'RESOLVIDA' && o.resolvida_em && o.resolvida_em >= desdeIso);

  // série diária (últimos `dias` dias, do mais antigo ao mais novo)
  const serie = new Map<string, { dia: string; abertas: number; resolvidas: number }>();
  for (let i = dias - 1; i >= 0; i--) {
    const d = diaLocal(new Date(agora.getTime() - i * 24 * HORA), cfg.turno.tz);
    serie.set(d, { dia: d, abertas: 0, resolvidas: 0 });
  }
  for (const o of abertasNoPeriodo) {
    const s = serie.get(o.dia_operacional);
    if (s) s.abertas += 1;
  }
  for (const o of resolvidasNoPeriodo) {
    const s = serie.get(diaLocal(new Date(o.resolvida_em!), cfg.turno.tz));
    if (s) s.resolvidas += 1;
  }

  const contar = <T,>(lista: T[], chave: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of lista) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1);
    return [...m.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total);
  };

  const porTipo = contar(abertasNoPeriodo, (o) => o.tipo);
  const porTurno = ['DIA', 'NOITE'].map((t) => ({ nome: t, total: abertasNoPeriodo.filter((o) => o.turno === t).length }));
  const porBaia = contar(abertasNoPeriodo, (o) => `${o.central} · Baia ${o.baia}`).slice(0, 8);

  const porEquip = new Map<number, { equipamento: string; local: string; ocorrencias: number }>();
  for (const o of abertasNoPeriodo) {
    const x = porEquip.get(o.equipamento_id) ?? { equipamento: o.equipamento, local: `${o.central} · Baia ${o.baia}`, ocorrencias: 0 };
    x.ocorrencias += 1;
    porEquip.set(o.equipamento_id, x);
  }
  const reincidentes = [...porEquip.values()].filter((x) => x.ocorrencias >= 2).sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 8);

  // tempo de reparo
  const horas = (o: { aberta_em: string; resolvida_em: string | null }) => (new Date(o.resolvida_em!).getTime() - new Date(o.aberta_em).getTime()) / HORA;
  const mttr = resolvidasNoPeriodo.length ? resolvidasNoPeriodo.reduce((s, o) => s + horas(o), 0) / resolvidasNoPeriodo.length : null;
  const mttrPorTipo = [...new Set(resolvidasNoPeriodo.map((o) => o.tipo))]
    .map((tipo) => {
      const l = resolvidasNoPeriodo.filter((o) => o.tipo === tipo);
      return { nome: tipo, horas: r1(l.reduce((s, o) => s + horas(o), 0) / l.length), resolvidas: l.length };
    })
    .sort((a, b) => b.horas - a.horas);

  // aderência: de cada turno já encerrado, em cada central ativa, o checklist foi concluído no prazo?
  const turnos = turnosEncerradosEntre(desde, agora, cfg.turno);
  const feitos = db
    .prepare('SELECT central_id, dia_operacional, turno, status, concluido_em FROM checklists WHERE dia_operacional >= ?')
    .all(turnos[0]?.diaOperacional ?? '0000-00-00') as Array<{ central_id: number; dia_operacional: string; turno: string; status: string; concluido_em: string | null }>;
  const chave = (c: number, d: string, t: string) => `${c}|${d}|${t}`;
  const idx = new Map(feitos.map((f) => [chave(f.central_id, f.dia_operacional, f.turno), f]));
  // Só conta a partir do primeiro checklist da central: antes disso o sistema ainda não estava em uso lá.
  const primeiros = new Map(
    (db.prepare('SELECT central_id, MIN(iniciado_em) AS primeiro FROM checklists GROUP BY central_id').all() as Array<{ central_id: number; primeiro: string }>)
      .map((r) => [r.central_id, turnoDe(new Date(r.primeiro), cfg.turno).inicio.getTime()]),
  );
  let noPrazo = 0, atrasados = 0, naoFeitos = 0;
  for (const t of turnos) {
    for (const c of centrais) {
      const inicioUso = primeiros.get(c.id);
      if (inicioUso === undefined || t.inicio.getTime() < inicioUso) continue;
      const f = idx.get(chave(c.id, t.diaOperacional, t.turno));
      if (!f || f.status !== 'CONCLUIDO' || !f.concluido_em) naoFeitos += 1;
      else if (new Date(f.concluido_em).getTime() <= t.inicio.getTime() + cfg.prazoChecklistMin * 60000) noPrazo += 1;
      else atrasados += 1;
    }
  }
  const totalEsperado = noPrazo + atrasados + naoFeitos;

  const maisAntigas = abertas
    .map((o) => ({ id: o.id, equipamento: o.equipamento, local: `${centrais.find((c) => c.id === o.central_id)?.nome ?? ''} · Baia ${o.baia}`, severidade: o.severidade, status: o.status, horas: r1((agora.getTime() - new Date(o.aberta_em).getTime()) / HORA) }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 6);

  return {
    geradoEm: agora.toISOString(),
    dias,
    resumo: {
      abertasAgora: abertas.length,
      inoperantes: abertas.filter((o) => o.severidade === 'INOPERANTE').length,
      novasNoPeriodo: abertasNoPeriodo.length,
      resolvidasNoPeriodo: resolvidasNoPeriodo.length,
      mttrHoras: mttr === null ? null : r1(mttr),
      aderenciaPct: totalEsperado ? Math.round((noPrazo / totalEsperado) * 100) : null,
      reincidentes: reincidentes.length,
    },
    mapa,
    serieDiaria: [...serie.values()],
    porTipo,
    porTurno,
    porBaia,
    reincidentes,
    mttrPorTipo,
    aderencia: { noPrazo, atrasados, naoFeitos, total: totalEsperado, prazoMin: cfg.prazoChecklistMin },
    maisAntigas,
  };
}
