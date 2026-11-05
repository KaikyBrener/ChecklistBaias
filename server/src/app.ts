import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { z, ZodError } from 'zod';
import type { Db } from './db.js';
import { ErroDominio } from './errors.js';
import {
  assinarSessao, autenticar, COOKIE, confereSenha, exigir, hashSenha, LimiteLogin, opcoesCookie,
} from './auth.js';
import { turnoDe } from './time.js';
import { montarPainel, type ConfigApp } from './painel.js';
import {
  adicionarEquipamento, atualizarBaia, atualizarCentral, atualizarEquipamento, atualizarUsuario, criarBaias,
  criarCentral, criarUsuario, detalharCentral, garantirTipo, listarCentrais, listarTipos, listarUsuarios,
} from './cadastro.js';
import {
  concluirChecklist, detalharChecklist, iniciarChecklist, listarChecklists, responderItem, tudoOkDaBaia,
} from './checklist.js';
import { adicionarNota, detalheOcorrencia, listarOcorrencias, mudarStatus, podeMudarStatus } from './ocorrencias.js';
import { ocorrenciasCsv } from './csv.js';
import { CONTAS_DEMO, SENHA_DEMO } from './demo.js';

export interface OpcoesApp {
  db: Db;
  cfg: ConfigApp;
  segredo: string;
  relogio?: () => Date;
  cookieSeguro?: boolean;
  webDir?: string;
  demo?: boolean;
  confiarProxy?: boolean;
}

const HASH_FALSO = hashSenha('senha-falsa-para-igualar-o-tempo');

const idParam = (req: Request, nome: string): number => {
  const n = Number(req.params[nome]);
  if (!Number.isInteger(n) || n < 1) throw new ErroDominio(400, 'Identificador inválido.');
  return n;
};

const papel = z.enum(['ADMIN', 'TI', 'COORDENADOR', 'GERENTE']);
const severidade = z.enum(['DEGRADADO', 'INOPERANTE']);

export function criarApp(o: OpcoesApp) {
  const { db, cfg } = o;
  const agora = o.relogio ?? (() => new Date());
  const limite = new LimiteLogin();
  const app = express();
  app.disable('x-powered-by');
  if (o.confiarProxy) app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Proteção contra CSRF: cookie SameSite=Strict + cabeçalho próprio exigido em toda escrita.
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Requested-With') !== 'checklist-baias') {
      return next(new ErroDominio(403, 'Requisição não autorizada.'));
    }
    next();
  });
  app.use('/api', autenticar(db, o.segredo));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  const api = express.Router();
  const logado = exigir();
  const soAdmin = exigir('ADMIN');

  // Público: a tela de login precisa saber se é demonstração (para mostrar as contas de teste).
  api.get('/publico', (_req, res) => {
    res.json({ demo: !!o.demo, contas: o.demo ? CONTAS_DEMO.map((c) => ({ login: c.login, nome: c.nome, papel: c.papel })) : [], senhaDemo: o.demo ? SENHA_DEMO : null });
  });

  // ---------- sessão ----------
  api.post('/auth/login', (req, res) => {
    const { login, senha } = z.object({ login: z.string().min(1).max(80), senha: z.string().min(1).max(200) }).parse(req.body);
    const chave = `${req.ip}|${login.toLowerCase()}`;
    limite.checar(chave);
    const u = db.prepare('SELECT id, nome, papel, senha_hash, ativo FROM usuarios WHERE login = ?').get(login) as
      | { id: number; nome: string; papel: 'ADMIN' | 'TI' | 'COORDENADOR' | 'GERENTE'; senha_hash: string; ativo: number }
      | undefined;
    const ok = confereSenha(senha, u?.senha_hash ?? HASH_FALSO) && !!u && !!u.ativo;
    if (!ok || !u) {
      limite.falhou(chave);
      throw new ErroDominio(401, 'Login ou senha incorretos.');
    }
    limite.sucesso(chave);
    res.cookie(COOKIE, assinarSessao(u, o.segredo), opcoesCookie(!!o.cookieSeguro));
    res.json({ id: u.id, nome: u.nome, papel: u.papel });
  });

  api.post('/auth/logout', (_req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  api.get('/auth/me', (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Sem sessão.' });
    const t = turnoDe(agora(), cfg.turno);
    res.json({
      usuario: req.usuario,
      demo: !!o.demo,
      tz: cfg.turno.tz,
      turnoAtual: { turno: t.turno, diaOperacional: t.diaOperacional, inicio: t.inicio.toISOString(), fim: t.fim.toISOString() },
      prazoChecklistMin: cfg.prazoChecklistMin,
    });
  });

  // ---------- cadastro ----------
  api.get('/centrais', logado, (_req, res) => res.json(listarCentrais(db)));
  api.post('/centrais', soAdmin, (req, res) => {
    const { nome } = z.object({ nome: z.string().min(2).max(80) }).parse(req.body);
    res.status(201).json(criarCentral(db, nome));
  });
  api.get('/centrais/:id', logado, (req, res) => res.json(detalharCentral(db, idParam(req, 'id'))));
  api.patch('/centrais/:id', soAdmin, (req, res) => {
    const p = z.object({ nome: z.string().min(2).max(80).optional(), ativa: z.boolean().optional() }).parse(req.body);
    atualizarCentral(db, idParam(req, 'id'), p);
    res.json({ ok: true });
  });
  api.post('/centrais/:id/baias', soAdmin, (req, res) => {
    const p = z.object({ de: z.number().int(), ate: z.number().int() }).parse(req.body);
    res.status(201).json(criarBaias(db, idParam(req, 'id'), p.de, p.ate));
  });
  api.patch('/baias/:id', soAdmin, (req, res) => {
    atualizarBaia(db, idParam(req, 'id'), z.object({ ativa: z.boolean().optional() }).parse(req.body));
    res.json({ ok: true });
  });
  api.post('/baias/:id/equipamentos', soAdmin, (req, res) => {
    const p = z.object({ tipo_id: z.number().int(), nome: z.string().min(2).max(60) }).parse(req.body);
    res.status(201).json(adicionarEquipamento(db, idParam(req, 'id'), p.tipo_id, p.nome));
  });
  api.patch('/equipamentos/:id', soAdmin, (req, res) => {
    const p = z.object({ nome: z.string().min(2).max(60).optional(), ativo: z.boolean().optional() }).parse(req.body);
    atualizarEquipamento(db, idParam(req, 'id'), p);
    res.json({ ok: true });
  });
  api.get('/tipos', logado, (_req, res) => res.json(listarTipos(db)));
  api.post('/tipos', soAdmin, (req, res) => {
    const { nome } = z.object({ nome: z.string().min(2).max(40) }).parse(req.body);
    res.status(201).json({ id: garantirTipo(db, nome) });
  });
  api.get('/usuarios', soAdmin, (_req, res) => res.json(listarUsuarios(db)));
  api.post('/usuarios', soAdmin, (req, res) => {
    const p = z.object({ nome: z.string().min(2).max(80), login: z.string().min(3).max(40), senha: z.string().max(200), papel }).parse(req.body);
    res.status(201).json(criarUsuario(db, p, agora()));
  });
  api.patch('/usuarios/:id', soAdmin, (req, res) => {
    const p = z.object({ nome: z.string().min(2).max(80).optional(), papel: papel.optional(), ativo: z.boolean().optional(), senha: z.string().max(200).optional() }).parse(req.body);
    atualizarUsuario(db, idParam(req, 'id'), p);
    res.json({ ok: true });
  });

  // ---------- checklist ----------
  const fazChecklist = exigir('COORDENADOR');

  api.get('/turno-atual', logado, (_req, res) => {
    const t = turnoDe(agora(), cfg.turno);
    const centrais = db.prepare('SELECT id, nome FROM centrais WHERE ativa = 1 ORDER BY nome').all() as Array<{ id: number; nome: string }>;
    const lista = centrais.map((c) => {
      const k = db
        .prepare('SELECT id, status, concluido_em FROM checklists WHERE central_id = ? AND dia_operacional = ? AND turno = ?')
        .get(c.id, t.diaOperacional, t.turno) as { id: number; status: string; concluido_em: string | null } | undefined;
      const total = (db
        .prepare('SELECT COUNT(*) AS n FROM equipamentos e JOIN baias b ON b.id = e.baia_id WHERE b.central_id = ? AND b.ativa = 1 AND e.ativo = 1')
        .get(c.id) as { n: number }).n;
      const respondidos = k ? (db.prepare('SELECT COUNT(*) AS n FROM checklist_itens WHERE checklist_id = ?').get(k.id) as { n: number }).n : 0;
      return { ...c, checklist: k ? { id: k.id, status: k.status, concluidoEm: k.concluido_em, respondidos, total } : null, total };
    });
    res.json({ turno: t.turno, diaOperacional: t.diaOperacional, inicio: t.inicio.toISOString(), fim: t.fim.toISOString(), centrais: lista });
  });

  api.post('/checklists', fazChecklist, (req, res) => {
    const { central_id } = z.object({ central_id: z.number().int() }).parse(req.body);
    const r = iniciarChecklist(db, central_id, req.usuario!.id, agora(), cfg.turno);
    res.status(r.criado ? 201 : 200).json(r);
  });
  api.get('/checklists', logado, (req, res) => {
    const central = req.query.central_id ? Number(req.query.central_id) : undefined;
    res.json(listarChecklists(db, central && Number.isInteger(central) ? central : undefined, Number(req.query.limite) || 60));
  });
  api.get('/checklists/:id', logado, (req, res) => res.json(detalharChecklist(db, idParam(req, 'id'))));
  api.put('/checklists/:id/itens/:equipamentoId', fazChecklist, (req, res) => {
    const p = z.object({ resultado: z.enum(['OK', 'DEFEITO', 'NA']), severidade: severidade.optional(), observacao: z.string().max(500).optional() }).parse(req.body);
    responderItem(db, idParam(req, 'id'), idParam(req, 'equipamentoId'), p, req.usuario!.id, agora());
    res.json({ ok: true });
  });
  api.post('/checklists/:id/baias/:baiaId/tudo-ok', fazChecklist, (req, res) => {
    res.json(tudoOkDaBaia(db, idParam(req, 'id'), idParam(req, 'baiaId'), req.usuario!.id, agora()));
  });
  api.post('/checklists/:id/concluir', fazChecklist, (req, res) => {
    concluirChecklist(db, idParam(req, 'id'), agora());
    res.json({ ok: true });
  });

  // ---------- ocorrências ----------
  const filtros = (req: Request) => {
    const q = z
      .object({
        situacao: z.enum(['abertas', 'encerradas', 'todas']).optional(),
        central_id: z.coerce.number().int().optional(),
        dias: z.coerce.number().int().min(1).max(366).optional(),
        limite: z.coerce.number().int().min(1).max(5000).optional(),
      })
      .parse(req.query);
    return {
      situacao: q.situacao,
      centralId: q.central_id,
      desde: q.dias ? new Date(agora().getTime() - q.dias * 86400000).toISOString() : undefined,
      limite: q.limite,
    };
  };
  api.get('/ocorrencias.csv', exigir('GERENTE', 'TI'), (req, res) => {
    const linhas = listarOcorrencias(db, { ...filtros(req), limite: filtros(req).limite ?? 5000 }) as Array<Record<string, unknown>>;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ocorrencias.csv"');
    res.send(ocorrenciasCsv(linhas, cfg.turno.tz));
  });
  api.get('/ocorrencias', logado, (req, res) => res.json(listarOcorrencias(db, filtros(req))));
  api.get('/ocorrencias/:id', logado, (req, res) => res.json(detalheOcorrencia(db, idParam(req, 'id'))));
  api.post('/ocorrencias/:id/status', logado, (req, res) => {
    if (!podeMudarStatus(req.usuario!.papel)) throw new ErroDominio(403, 'Só a TI altera o andamento da ocorrência.');
    const p = z
      .object({ status: z.enum(['ABERTA', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA']), nota: z.string().max(500).optional() })
      .parse(req.body);
    res.json(mudarStatus(db, idParam(req, 'id'), p.status, p.nota ?? '', req.usuario!.id, agora()));
  });
  api.post('/ocorrencias/:id/notas', logado, (req, res) => {
    const { nota } = z.object({ nota: z.string().min(2).max(500) }).parse(req.body);
    adicionarNota(db, idParam(req, 'id'), nota, req.usuario!.id, agora());
    res.status(201).json({ ok: true });
  });

  // ---------- painel ----------
  api.get('/painel', logado, (req, res) => {
    const { dias } = z.object({ dias: z.coerce.number().int().min(1).max(366).default(30) }).parse(req.query);
    res.json(montarPainel(db, agora(), cfg, dias));
  });

  api.use((_req, _res, next) => next(new ErroDominio(404, 'Recurso não encontrado.')));
  app.use('/api', api);

  // ---------- front-end ----------
  if (o.webDir && fs.existsSync(path.join(o.webDir, 'index.html'))) {
    app.use(express.static(o.webDir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.resolve(o.webDir!, 'index.html'));
    });
  }

  // ---------- erros ----------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ErroDominio) return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
    if (err instanceof ZodError) {
      const i = err.issues[0];
      return res.status(400).json({ erro: `Dados inválidos${i ? ` (${i.path.join('.') || 'corpo'}: ${i.message})` : ''}.` });
    }
    if ((err as { type?: string }).type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    if ((err as { type?: string }).type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição grande demais.' });
    console.error('[erro]', err);
    res.status(500).json({ erro: 'Erro interno. Tente novamente; se persistir, avise a TI.' });
  });

  return app;
}
