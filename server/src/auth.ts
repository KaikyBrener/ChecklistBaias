import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Db } from './db.js';
import { ErroDominio } from './errors.js';

export type Papel = 'ADMIN' | 'TI' | 'COORDENADOR' | 'GERENTE';
export interface UsuarioSessao {
  id: number;
  nome: string;
  papel: Papel;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioSessao;
  }
}

export const COOKIE = 'cb_sessao';
const DURACAO_HORAS = 12;

export function hashSenha(senha: string): string {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('base64')}$${h.toString('base64')}`;
}

export function confereSenha(senha: string, guardada: string): boolean {
  const [alg, salB64, hB64] = guardada.split('$');
  if (alg !== 'scrypt' || !salB64 || !hB64) return false;
  const esperado = Buffer.from(hB64, 'base64');
  const h = crypto.scryptSync(senha, Buffer.from(salB64, 'base64'), esperado.length);
  return crypto.timingSafeEqual(esperado, h);
}

/** `versao` é a `sessao_versao` do usuário no momento do login; se ela mudar no banco, o token deixa de valer. */
export function assinarSessao(u: { id: number }, versao: number, segredo: string): string {
  return jwt.sign({ sub: String(u.id), v: versao }, segredo, { expiresIn: `${DURACAO_HORAS}h` });
}

/** Derruba todas as sessões abertas do usuário e devolve a nova versão. */
export function encerrarSessoes(db: Db, usuarioId: number): number {
  db.prepare('UPDATE usuarios SET sessao_versao = sessao_versao + 1 WHERE id = ?').run(usuarioId);
  return (db.prepare('SELECT sessao_versao AS v FROM usuarios WHERE id = ?').get(usuarioId) as { v: number }).v;
}

export const opcoesCookie = (seguro: boolean) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: seguro,
  maxAge: DURACAO_HORAS * 3600 * 1000,
  path: '/',
});

/**
 * Lê o cookie e confere o usuário no banco a cada requisição: desativar a conta, sair ou trocar a senha
 * vale na hora, porque a versão guardada no token deixa de bater com a do banco.
 */
export function autenticar(db: Db, segredo: string) {
  const busca = db.prepare('SELECT id, nome, papel, sessao_versao FROM usuarios WHERE id = ? AND ativo = 1');
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[COOKIE];
    if (token) {
      try {
        const dados = jwt.verify(token, segredo) as { sub: string; v?: number };
        const u = busca.get(Number(dados.sub)) as (UsuarioSessao & { sessao_versao: number }) | undefined;
        if (u && (dados.v ?? 0) === u.sessao_versao) req.usuario = { id: u.id, nome: u.nome, papel: u.papel };
      } catch {
        /* token inválido ou expirado: segue como não autenticado */
      }
    }
    next();
  };
}

export function exigir(...papeis: Papel[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) return next(new ErroDominio(401, 'Faça login para continuar.'));
    if (papeis.length && !papeis.includes(req.usuario.papel) && req.usuario.papel !== 'ADMIN') {
      return next(new ErroDominio(403, 'Seu perfil não tem permissão para esta ação.'));
    }
    next();
  };
}

/** Limitador simples de tentativas de login (em memória). */
export class LimiteLogin {
  private tentativas = new Map<string, { n: number; ate: number }>();
  constructor(
    private max = 8,
    private janelaMs = 10 * 60 * 1000,
  ) {}
  checar(chave: string, agora = Date.now()): void {
    const t = this.tentativas.get(chave);
    if (t && t.ate > agora && t.n >= this.max) {
      throw new ErroDominio(429, 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.');
    }
  }
  falhou(chave: string, agora = Date.now()): void {
    // Evita crescimento sem limite da memória com tentativas de logins aleatórios.
    if (this.tentativas.size >= 5000) {
      for (const [k, v] of this.tentativas) if (v.ate <= agora) this.tentativas.delete(k);
    }
    const t = this.tentativas.get(chave);
    if (!t || t.ate <= agora) this.tentativas.set(chave, { n: 1, ate: agora + this.janelaMs });
    else t.n += 1;
  }
  sucesso(chave: string): void {
    this.tentativas.delete(chave);
  }
}
