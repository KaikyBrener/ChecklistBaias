import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { abrirBanco, type Db } from '../src/db.js';
import { criarApp } from '../src/app.js';
import { criarUsuario } from '../src/cadastro.js';
import { turnoConfigPadrao } from '../src/time.js';

export interface Resp<T = any> { status: number; corpo: T; headers: Headers }

export class Cliente {
  cookie = '';
  constructor(private base: string) {}
  async req<T = any>(metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}): Promise<Resp<T>> {
    const headers: Record<string, string> = { 'X-Requested-With': 'checklist-baias', ...extra };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookie) headers.Cookie = this.cookie;
    const r = await fetch(this.base + caminho, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    const set = r.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    const texto = await r.text();
    let c: any = texto;
    try { c = JSON.parse(texto); } catch { /* texto puro (csv) */ }
    return { status: r.status, corpo: c, headers: r.headers };
  }
  get = <T = any>(c: string) => this.req<T>('GET', c);
  post = <T = any>(c: string, b: unknown = {}) => this.req<T>('POST', c, b);
  put = <T = any>(c: string, b: unknown) => this.req<T>('PUT', c, b);
  patch = <T = any>(c: string, b: unknown) => this.req<T>('PATCH', c, b);
  async login(login: string, senha = 'senha-forte-123') {
    const r = await this.post('/api/auth/login', { login, senha });
    if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${JSON.stringify(r.corpo)}`);
  }
}

export interface Ambiente {
  db: Db;
  url: string;
  agora: Date;
  avancarHoras(h: number): void;
  definir(iso: string): void;
  cliente(login?: string): Promise<Cliente>;
  fechar(): Promise<void>;
}

/** 04/11/2026 08:00 em São Paulo (UTC-3) = início do turno DIA. */
export const INICIO_DIA = '2026-11-04T11:00:00.000Z';

export async function criarAmbiente(inicio = INICIO_DIA): Promise<Ambiente> {
  const db = abrirBanco(':memory:');
  const amb: Ambiente = {
    db,
    url: '',
    agora: new Date(inicio),
    avancarHoras(h) { amb.agora = new Date(amb.agora.getTime() + h * 3600_000); },
    definir(iso) { amb.agora = new Date(iso); },
    async cliente(login) { const c = new Cliente(amb.url); if (login) await c.login(login); return c; },
    fechar: async () => {},
  };
  for (const [nome, login, papel] of [
    ['Admin Teste', 'admin', 'ADMIN'], ['Coord Teste', 'coord', 'COORDENADOR'], ['TI Teste', 'tecnico', 'TI'], ['Gerente Teste', 'gerente', 'GERENTE'],
  ] as const) criarUsuario(db, { nome, login, senha: 'senha-forte-123', papel }, amb.agora);
  const app = criarApp({ db, cfg: { turno: turnoConfigPadrao, prazoChecklistMin: 60 }, segredo: 'segredo-de-teste-com-tamanho-ok', relogio: () => amb.agora });
  const srv = http.createServer(app);
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  amb.url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  amb.fechar = () => new Promise((ok) => { srv.close(() => { db.close(); ok(); }); });
  return amb;
}

/** Cria 1 central com `nBaias` baias (7 equipamentos cada) pelo admin e devolve ids. */
export async function montarCentral(amb: Ambiente, nome = 'Central 1', nBaias = 2) {
  const admin = await amb.cliente('admin');
  const c = await admin.post('/api/centrais', { nome });
  await admin.post(`/api/centrais/${c.corpo.id}/baias`, { de: 1, ate: nBaias });
  const det = (await admin.get(`/api/centrais/${c.corpo.id}`)).corpo;
  return { centralId: c.corpo.id as number, detalhe: det, admin };
}
