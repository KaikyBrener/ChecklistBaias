/**
 * Dados FICTÍCIOS para demonstração: duas centrais, 15 baias cada, ~30 dias de histórico.
 * O histórico é gerado pelas mesmas regras do sistema (checklists, ocorrências, log), só com o relógio simulado,
 * então os gráficos mostram exatamente o que o sistema real mostraria. Nenhum dado real é usado.
 */
import type { Db } from './db.js';
import { criarBaias, criarCentral, criarUsuario } from './cadastro.js';
import { concluirChecklist, iniciarChecklist, responderItem } from './checklist.js';
import { mudarStatus, type StatusOcorrencia } from './ocorrencias.js';
import { proximoTurno, turnoDe, turnosEncerradosEntre, type TurnoConfig } from './time.js';

export const SENHA_DEMO = 'demo12345';
export const CONTAS_DEMO = [
  { login: 'coordenador', nome: 'Carla (coordenadora)', papel: 'COORDENADOR' as const },
  { login: 'tecnico', nome: 'Tiago (TI)', papel: 'TI' as const },
  { login: 'gerente', nome: 'Marcos (gerente)', papel: 'GERENTE' as const },
  { login: 'admin', nome: 'Administrador', papel: 'ADMIN' as const },
];

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAXA: Record<string, number> = { Monitor: 0.0045, Headset: 0.007, 'Teclado e mouse': 0.004, Computador: 0.002, Telefone: 0.003, Nobreak: 0.0012 };
const REPARO_H: Record<string, number> = { Monitor: 30, Headset: 10, 'Teclado e mouse': 6, Computador: 20, Telefone: 14, Nobreak: 72 };
const PECA: Record<string, number> = { Monitor: 0.35, Computador: 0.3, Nobreak: 0.6, Telefone: 0.15, Headset: 0.1, 'Teclado e mouse': 0.05 };
const GRAVE: Record<string, number> = { Computador: 0.8, Nobreak: 0.5, Telefone: 0.5, Headset: 0.4, Monitor: 0.25, 'Teclado e mouse': 0.5 };
const DESCRICOES: Record<string, string[]> = {
  Monitor: ['Tela piscando', 'Listras na imagem', 'Não liga', 'Imagem escura', 'Sem sinal de vídeo'],
  Headset: ['Sem áudio no fone esquerdo', 'Microfone mudo', 'Almofada solta', 'Cabo com mau contato'],
  'Teclado e mouse': ['Teclas falhando', 'Mouse travando', 'Mouse sem resposta'],
  Computador: ['Reinicia sozinho', 'Muito lento', 'Não liga', 'Sem rede'],
  Telefone: ['Sem tom de discagem', 'Display apagado', 'Ruído na linha'],
  Nobreak: ['Apitando sem parar', 'Bateria não segura carga', 'Não liga'],
};

interface Acao { em: number; ocorrenciaId: number; para: StatusOcorrencia; nota: string }

export function semearDemo(db: Db, cfg: TurnoConfig, agora: Date, dias = 30): void {
  const rnd = mulberry32(20261104);
  const choice = <T,>(l: T[]) => l[Math.floor(rnd() * l.length)] as T;
  const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

  db.transaction(() => {
    const t0 = new Date(agora.getTime() - dias * 86400000);
    const ids: Record<string, number> = {};
    for (const c of CONTAS_DEMO) ids[c.login] = criarUsuario(db, { nome: c.nome, login: c.login, senha: SENHA_DEMO, papel: c.papel }, t0).id;
    const coord = ids.coordenador!, ti = ids.tecnico!;

    const centrais = ['Central 1', 'Central 2'].map((nome) => {
      const id = criarCentral(db, nome).id;
      criarBaias(db, id, 1, 15);
      return { id, nome };
    });

    // equipamentos por central, com tipo e baia
    const equipamentos = new Map<number, Array<{ id: number; tipo: string; baia: number; nome: string }>>();
    for (const c of centrais) {
      equipamentos.set(
        c.id,
        db
          .prepare(
            `SELECT e.id, t.nome AS tipo, b.numero AS baia, e.nome FROM equipamentos e
             JOIN tipos_equipamento t ON t.id = e.tipo_id JOIN baias b ON b.id = e.baia_id
             WHERE b.central_id = ? ORDER BY b.numero, e.id`,
          )
          .all(c.id) as Array<{ id: number; tipo: string; baia: number; nome: string }>,
      );
    }
    // baias "problemáticas" geram reincidência (para o gráfico de reincidentes ter história)
    const fator = (centralNome: string, baia: number, nome: string) =>
      centralNome === 'Central 1' && baia === 7 ? (nome === 'Headset' ? 6 : 2.5) : centralNome === 'Central 2' && baia === 12 ? 3 : 1;

    const fila: Acao[] = [];
    const funcionaDesde = new Map<number, number>(); // ocorrência → instante em que passou a funcionar (sem registro da TI)

    const processarFila = (ate: number) => {
      fila.sort((a, b) => a.em - b.em);
      while (fila.length && fila[0]!.em <= ate) {
        const a = fila.shift()!;
        try { mudarStatus(db, a.ocorrenciaId, a.para, a.nota, ti, new Date(a.em)); } catch { /* já mudou por outro caminho */ }
      }
    };

    const agendar = (ocorrenciaId: number, aberta: number, tipo: string) => {
      const horas = REPARO_H[tipo]! * Math.exp(normal() * 0.6);
      const fim = aberta + horas * 3600000;
      const assume = aberta + (1 + rnd() * 7) * 3600000;
      fila.push({ em: assume, ocorrenciaId, para: 'EM_MANUTENCAO', nota: 'Técnico assumiu o chamado.' });
      let resolveEm = fim;
      if (rnd() < PECA[tipo]!) {
        const espera = aberta + horas * 0.35 * 3600000;
        fila.push({ em: espera, ocorrenciaId, para: 'AGUARDANDO_PECA', nota: 'Peça solicitada ao almoxarifado.' });
        fila.push({ em: aberta + horas * 0.7 * 3600000, ocorrenciaId, para: 'EM_MANUTENCAO', nota: 'Peça chegou, reparo em andamento.' });
      }
      if (rnd() < 0.1) funcionaDesde.set(ocorrenciaId, resolveEm); // a TI esqueceu de fechar; quem percebe é o checklist
      else fila.push({ em: resolveEm, ocorrenciaId, para: 'RESOLVIDA', nota: 'Reparo concluído.' });
    };

    /** Responde os equipamentos da central; `ate` = quantas baias responder (todas, se omitido). */
    type Forcado = { sev: 'INOPERANTE' | 'DEGRADADO'; desc: string; fim: 'ABERTA' | 'PECA' | 'MANUT' };
    const preencher = (central: { id: number; nome: string }, clId: number, inicio: number, duracaoMin: number, ate = 15, forcar: Record<string, Forcado> = {}) => {
      const lista = equipamentos.get(central.id)!.filter((e) => e.baia <= ate);
      lista.forEach((e, i) => {
        const quando = inicio + (i / lista.length) * duracaoMin * 60000;
        processarFila(quando);
        const aberta = db.prepare("SELECT id FROM ocorrencias WHERE equipamento_id = ? AND status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA')").get(e.id) as { id: number } | undefined;
        const t = new Date(quando);
        if (aberta) {
          const volta = funcionaDesde.get(aberta.id);
          responderItem(db, clId, e.id, volta !== undefined && volta <= quando ? { resultado: 'OK' } : { resultado: 'DEFEITO' }, coord, t);
          return;
        }
        const f = forcar[`${e.baia}|${e.nome}`];
        if (f) {
          responderItem(db, clId, e.id, { resultado: 'DEFEITO', severidade: f.sev, observacao: f.desc }, coord, t);
          const novo = db.prepare("SELECT id FROM ocorrencias WHERE equipamento_id = ? AND status = 'ABERTA'").get(e.id) as { id: number };
          if (f.fim !== 'ABERTA') fila.push({ em: quando + 5 * 3600000, ocorrenciaId: novo.id, para: 'EM_MANUTENCAO', nota: 'Técnico assumiu o chamado.' });
          if (f.fim === 'PECA') fila.push({ em: quando + 20 * 3600000, ocorrenciaId: novo.id, para: 'AGUARDANDO_PECA', nota: 'Peça solicitada ao fornecedor.' });
          return;
        }
        if (rnd() < TAXA[e.tipo]! * fator(central.nome, e.baia, e.nome)) {
          const grave = rnd() < GRAVE[e.tipo]!;
          responderItem(db, clId, e.id, { resultado: 'DEFEITO', severidade: grave ? 'INOPERANTE' : 'DEGRADADO', observacao: choice(DESCRICOES[e.tipo]!) }, coord, t);
          const novo = db.prepare("SELECT id FROM ocorrencias WHERE equipamento_id = ? AND status = 'ABERTA'").get(e.id) as { id: number };
          agendar(novo.id, quando, e.tipo);
        } else {
          responderItem(db, clId, e.id, { resultado: 'OK' }, coord, t);
        }
      });
    };

    // turnos já encerrados
    const encerrados = turnosEncerradosEntre(t0, agora, cfg);
    const forcadosPorTurno: Record<number, Record<string, Record<string, Forcado>>> = {
      [encerrados.length - 9]: { 'Central 2': { '4|Nobreak': { sev: 'INOPERANTE', desc: 'Não segura carga, desliga ao faltar energia', fim: 'PECA' } } },
      [encerrados.length - 3]: { 'Central 1': { '3|Monitor 1': { sev: 'INOPERANTE', desc: 'Tela não liga', fim: 'MANUT' }, '7|Headset': { sev: 'DEGRADADO', desc: 'Microfone com chiado', fim: 'ABERTA' } } },
      [encerrados.length - 1]: { 'Central 2': { '12|Teclado e mouse': { sev: 'DEGRADADO', desc: 'Teclas falhando', fim: 'ABERTA' } } },
    };
    for (const [idx, turno] of encerrados.entries()) {
      for (const c of centrais) {
        const sorte = rnd();
        if (sorte < 0.04) continue; // ninguém fez o checklist nesse turno
        const atraso = sorte < 0.14 ? 61 + rnd() * 90 : rnd() * 40;
        const inicio = turno.inicio.getTime() + atraso * 60000;
        processarFila(inicio);
        const cl = iniciarChecklist(db, c.id, coord, new Date(inicio), cfg);
        const dur = 7 + rnd() * 8;
        preencher(c, cl.id, inicio, dur, 15, forcadosPorTurno[idx]?.[c.nome]);
        concluirChecklist(db, cl.id, new Date(inicio + dur * 60000));
      }
    }

    // turno em andamento: Central 1 pela metade, Central 2 ainda não começou
    const atual = turnoDe(agora, cfg);
    const inicioAtual = atual.inicio.getTime() + 12 * 60000;
    if (agora.getTime() - inicioAtual > 20 * 60000) {
      const c1 = centrais[0]!;
      processarFila(inicioAtual);
      const cl = iniciarChecklist(db, c1.id, coord, new Date(inicioAtual), cfg);
      preencher(c1, cl.id, inicioAtual, 6, 9);
    }
    processarFila(agora.getTime() - 60000);
    void proximoTurno;
  })();
}
