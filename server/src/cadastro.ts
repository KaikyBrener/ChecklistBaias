import type { Db } from './db.js';
import { ErroDominio } from './errors.js';
import { confereSenha, encerrarSessoes, hashSenha, type Papel } from './auth.js';
import { iso } from './time.js';

export const EQUIPAMENTOS_PADRAO: Array<{ tipo: string; nome: string }> = [
  { tipo: 'Monitor', nome: 'Monitor 1' },
  { tipo: 'Monitor', nome: 'Monitor 2' },
  { tipo: 'Computador', nome: 'Computador' },
  { tipo: 'Headset', nome: 'Headset' },
  { tipo: 'Teclado e mouse', nome: 'Teclado e mouse' },
  { tipo: 'Telefone', nome: 'Telefone' },
  { tipo: 'Nobreak', nome: 'Nobreak' },
];

const OPEN = `('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA')`;

export function garantirTipo(db: Db, nome: string): number {
  const n = nome.trim();
  if (n.length < 2) throw new ErroDominio(400, 'Informe o nome do tipo de equipamento.');
  const ex = db.prepare('SELECT id FROM tipos_equipamento WHERE nome = ?').get(n) as { id: number } | undefined;
  if (ex) return ex.id;
  return Number(db.prepare('INSERT INTO tipos_equipamento (nome) VALUES (?)').run(n).lastInsertRowid);
}

export function listarTipos(db: Db) {
  return db.prepare('SELECT id, nome FROM tipos_equipamento ORDER BY nome').all();
}

export function listarCentrais(db: Db) {
  return db
    .prepare(
      `SELECT c.id, c.nome, c.ativa,
        (SELECT COUNT(*) FROM baias b WHERE b.central_id = c.id AND b.ativa = 1) AS baias,
        (SELECT COUNT(*) FROM equipamentos e JOIN baias b ON b.id = e.baia_id WHERE b.central_id = c.id AND b.ativa = 1 AND e.ativo = 1) AS equipamentos
       FROM centrais c ORDER BY c.nome`,
    )
    .all();
}

export function criarCentral(db: Db, nome: string) {
  const n = nome.trim();
  if (n.length < 2) throw new ErroDominio(400, 'Informe o nome da central.');
  try {
    return { id: Number(db.prepare('INSERT INTO centrais (nome) VALUES (?)').run(n).lastInsertRowid) };
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new ErroDominio(409, 'Já existe uma central com esse nome.');
    throw e;
  }
}

export function atualizarCentral(db: Db, id: number, p: { nome?: string; ativa?: boolean }) {
  const c = db.prepare('SELECT id FROM centrais WHERE id = ?').get(id);
  if (!c) throw new ErroDominio(404, 'Central não encontrada.');
  if (p.ativa === false) {
    const aberto = db
      .prepare(`SELECT COUNT(*) AS n FROM ocorrencias o JOIN equipamentos e ON e.id = o.equipamento_id JOIN baias b ON b.id = e.baia_id WHERE b.central_id = ? AND o.status IN ${OPEN}`)
      .get(id) as { n: number };
    if (aberto.n) throw new ErroDominio(409, 'Há ocorrências em aberto nesta central. Resolva ou cancele antes de desativar.');
  }
  try {
    if (p.nome !== undefined) db.prepare('UPDATE centrais SET nome = ? WHERE id = ?').run(p.nome.trim(), id);
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new ErroDominio(409, 'Já existe uma central com esse nome.');
    throw e;
  }
  if (p.ativa !== undefined) db.prepare('UPDATE centrais SET ativa = ? WHERE id = ?').run(p.ativa ? 1 : 0, id);
}

export function detalharCentral(db: Db, id: number) {
  const c = db.prepare('SELECT id, nome, ativa FROM centrais WHERE id = ?').get(id) as { id: number; nome: string; ativa: number } | undefined;
  if (!c) throw new ErroDominio(404, 'Central não encontrada.');
  const linhas = db
    .prepare(
      `SELECT b.id AS baia_id, b.numero, b.ativa AS baia_ativa, e.id AS equipamento_id, e.nome, e.ativo, t.nome AS tipo
       FROM baias b LEFT JOIN equipamentos e ON e.baia_id = b.id LEFT JOIN tipos_equipamento t ON t.id = e.tipo_id
       WHERE b.central_id = ? ORDER BY b.numero, e.id`,
    )
    .all(id) as Array<Record<string, unknown>>;
  const baias = new Map<number, { id: number; numero: number; ativa: boolean; equipamentos: unknown[] }>();
  for (const l of linhas) {
    const bid = l.baia_id as number;
    if (!baias.has(bid)) baias.set(bid, { id: bid, numero: l.numero as number, ativa: !!l.baia_ativa, equipamentos: [] });
    if (l.equipamento_id) baias.get(bid)!.equipamentos.push({ id: l.equipamento_id, nome: l.nome, tipo: l.tipo, ativo: !!l.ativo });
  }
  return { id: c.id, nome: c.nome, ativa: !!c.ativa, baias: [...baias.values()] };
}

/** Cria as baias de `de` até `ate` já com o conjunto padrão de equipamentos (ou o informado). */
export function criarBaias(
  db: Db,
  centralId: number,
  de: number,
  ate: number,
  modelo: Array<{ tipo: string; nome: string }> = EQUIPAMENTOS_PADRAO,
) {
  if (!Number.isInteger(de) || !Number.isInteger(ate) || de < 1 || ate < de || ate - de > 199) {
    throw new ErroDominio(400, 'Intervalo de baias inválido (use números de 1 a 200).');
  }
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM centrais WHERE id = ?').get(centralId)) throw new ErroDominio(404, 'Central não encontrada.');
    const tipos = new Map<string, number>();
    for (const m of modelo) if (!tipos.has(m.tipo)) tipos.set(m.tipo, garantirTipo(db, m.tipo));
    let criadas = 0;
    for (let n = de; n <= ate; n++) {
      const existe = db.prepare('SELECT 1 FROM baias WHERE central_id = ? AND numero = ?').get(centralId, n);
      if (existe) continue;
      const baiaId = Number(db.prepare('INSERT INTO baias (central_id, numero) VALUES (?, ?)').run(centralId, n).lastInsertRowid);
      for (const m of modelo) {
        db.prepare('INSERT INTO equipamentos (baia_id, tipo_id, nome) VALUES (?, ?, ?)').run(baiaId, tipos.get(m.tipo)!, m.nome.trim());
      }
      criadas += 1;
    }
    return { criadas };
  })();
}

function temAberta(db: Db, where: string, id: number): boolean {
  const r = db
    .prepare(`SELECT COUNT(*) AS n FROM ocorrencias o JOIN equipamentos e ON e.id = o.equipamento_id WHERE o.status IN ${OPEN} AND ${where} = ?`)
    .get(id) as { n: number };
  return r.n > 0;
}

export function atualizarBaia(db: Db, id: number, p: { ativa?: boolean }) {
  if (!db.prepare('SELECT 1 FROM baias WHERE id = ?').get(id)) throw new ErroDominio(404, 'Baia não encontrada.');
  if (p.ativa === false && temAberta(db, 'e.baia_id', id)) {
    throw new ErroDominio(409, 'Há ocorrência em aberto nesta baia. Resolva ou cancele antes de desativá-la.');
  }
  if (p.ativa !== undefined) db.prepare('UPDATE baias SET ativa = ? WHERE id = ?').run(p.ativa ? 1 : 0, id);
}

export function adicionarEquipamento(db: Db, baiaId: number, tipoId: number, nome: string) {
  if (!db.prepare('SELECT 1 FROM baias WHERE id = ?').get(baiaId)) throw new ErroDominio(404, 'Baia não encontrada.');
  if (!db.prepare('SELECT 1 FROM tipos_equipamento WHERE id = ?').get(tipoId)) throw new ErroDominio(400, 'Tipo de equipamento inválido.');
  const n = nome.trim();
  if (n.length < 2) throw new ErroDominio(400, 'Informe o nome do equipamento.');
  try {
    return { id: Number(db.prepare('INSERT INTO equipamentos (baia_id, tipo_id, nome) VALUES (?, ?, ?)').run(baiaId, tipoId, n).lastInsertRowid) };
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new ErroDominio(409, 'Esta baia já tem um equipamento com esse nome.');
    throw e;
  }
}

export function atualizarEquipamento(db: Db, id: number, p: { nome?: string; ativo?: boolean }) {
  if (!db.prepare('SELECT 1 FROM equipamentos WHERE id = ?').get(id)) throw new ErroDominio(404, 'Equipamento não encontrado.');
  if (p.ativo === false && temAberta(db, 'e.id', id)) {
    throw new ErroDominio(409, 'Este equipamento tem ocorrência em aberto. Resolva ou cancele antes de desativá-lo.');
  }
  if (p.nome !== undefined) {
    const n = p.nome.trim();
    if (n.length < 2) throw new ErroDominio(400, 'Informe o nome do equipamento.');
    try {
      db.prepare('UPDATE equipamentos SET nome = ? WHERE id = ?').run(n, id);
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) throw new ErroDominio(409, 'Esta baia já tem um equipamento com esse nome.');
      throw e;
    }
  }
  if (p.ativo !== undefined) db.prepare('UPDATE equipamentos SET ativo = ? WHERE id = ?').run(p.ativo ? 1 : 0, id);
}

// ---------- usuários ----------
export function listarUsuarios(db: Db) {
  return db.prepare('SELECT id, nome, login, papel, ativo, criado_em FROM usuarios ORDER BY nome').all();
}

function validarSenha(senha: string) {
  if (senha.length < 8) throw new ErroDominio(400, 'A senha precisa ter pelo menos 8 caracteres.');
}

export function criarUsuario(
  db: Db,
  p: { nome: string; login: string; senha: string; papel: Papel },
  agora: Date,
  opcoes: { ignorarRegraSenha?: boolean } = {},
) {
  if (!opcoes.ignorarRegraSenha) validarSenha(p.senha);
  if (p.nome.trim().length < 2 || p.login.trim().length < 3) throw new ErroDominio(400, 'Informe nome e login (mínimo 3 caracteres).');
  try {
    const r = db
      .prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(p.nome.trim(), p.login.trim(), hashSenha(p.senha), p.papel, iso(agora));
    return { id: Number(r.lastInsertRowid) };
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) throw new ErroDominio(409, 'Já existe um usuário com esse login.');
    throw e;
  }
}

export function atualizarUsuario(db: Db, id: number, p: { nome?: string; papel?: Papel; ativo?: boolean; senha?: string }) {
  const u = db.prepare('SELECT id, papel, ativo FROM usuarios WHERE id = ?').get(id) as { papel: Papel; ativo: number } | undefined;
  if (!u) throw new ErroDominio(404, 'Usuário não encontrado.');
  const deixaDeSerAdminAtivo = u.papel === 'ADMIN' && u.ativo && ((p.papel && p.papel !== 'ADMIN') || p.ativo === false);
  if (deixaDeSerAdminAtivo) {
    const outros = db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE papel = 'ADMIN' AND ativo = 1 AND id <> ?").get(id) as { n: number };
    if (!outros.n) throw new ErroDominio(409, 'Não é possível remover o último administrador ativo.');
  }
  if (p.nome !== undefined) db.prepare('UPDATE usuarios SET nome = ? WHERE id = ?').run(p.nome.trim(), id);
  if (p.papel !== undefined) db.prepare('UPDATE usuarios SET papel = ? WHERE id = ?').run(p.papel, id);
  if (p.senha !== undefined) validarSenha(p.senha);
  if (p.ativo !== undefined) db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(p.ativo ? 1 : 0, id);
  if (p.senha !== undefined) db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(p.senha), id);
  // Senha redefinida ou conta desativada: quem estava logado com a credencial antiga cai na hora.
  if (p.senha !== undefined || p.ativo === false) encerrarSessoes(db, id);
}

/** O próprio usuário troca a senha: confere a atual, grava a nova e derruba as outras sessões. Devolve a nova versão. */
export function trocarPropriaSenha(db: Db, id: number, atual: string, nova: string): number {
  const u = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ? AND ativo = 1').get(id) as { senha_hash: string } | undefined;
  if (!u) throw new ErroDominio(404, 'Usuário não encontrado.');
  if (!confereSenha(atual, u.senha_hash)) throw new ErroDominio(400, 'A senha atual não confere.');
  validarSenha(nova);
  if (nova === atual) throw new ErroDominio(400, 'A nova senha precisa ser diferente da atual.');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(nova), id);
  return encerrarSessoes(db, id);
}
