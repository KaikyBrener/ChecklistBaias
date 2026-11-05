import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app.js';
import { criarUsuario } from './cadastro.js';
import { abrirBanco } from './db.js';
import { semearDemo } from './demo.js';
import { turnoConfigPadrao, validarConfig } from './time.js';

const env = process.env;
const inteiro = (v: string | undefined, padrao: number) => (v === undefined || v === '' ? padrao : Number(v));

const dbPath = env.DB_PATH ?? './data/checklist.db';
const demo = env.DEMO === '1';
const turno = {
  tz: env.TZ_OPERACAO ?? turnoConfigPadrao.tz,
  diaInicioHora: inteiro(env.TURNO_DIA_HORA, turnoConfigPadrao.diaInicioHora),
  noiteInicioHora: inteiro(env.TURNO_NOITE_HORA, turnoConfigPadrao.noiteInicioHora),
};
validarConfig(turno);

// Segredo da sessão: variável de ambiente, ou gerado uma vez e guardado ao lado do banco.
function carregarSegredo(): string {
  if (env.JWT_SECRET && env.JWT_SECRET.length >= 32) return env.JWT_SECRET;
  if (env.JWT_SECRET) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
  const arq = path.join(path.dirname(path.resolve(dbPath)), 'segredo-sessao');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  if (fs.existsSync(arq)) return fs.readFileSync(arq, 'utf8').trim();
  const novo = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(arq, novo, { mode: 0o600 });
  return novo;
}

const db = abrirBanco(dbPath);
const cfg = { turno, prazoChecklistMin: inteiro(env.PRAZO_CHECKLIST_MIN, 60) };

const semUsuarios = (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n === 0;
if (semUsuarios) {
  if (demo) {
    semearDemo(db, turno, new Date());
    console.log('[demo] Dados fictícios criados. Contas: coordenador, tecnico, gerente, admin — senha: demo12345');
  } else {
    const login = env.ADMIN_LOGIN ?? 'admin';
    // Desenvolvimento: admin / admin (a regra de 8 caracteres é ignorada só nesse caso).
    // Produção (NODE_ENV=production, como na imagem Docker): nunca usa senha previsível; gera uma aleatória.
    const emProducao = env.NODE_ENV === 'production';
    const usaPadraoDev = !env.ADMIN_SENHA && !emProducao;
    const senha = env.ADMIN_SENHA ?? (usaPadraoDev ? 'admin' : crypto.randomBytes(9).toString('base64url'));
    criarUsuario(db, { nome: 'Administrador', login, senha, papel: 'ADMIN' }, new Date(), { ignorarRegraSenha: usaPadraoDev });
    console.log('==================================================================');
    console.log(` Primeiro acesso criado. Login: ${login}`);
    if (usaPadraoDev) console.log(` Senha padrão de desenvolvimento: ${senha}  (troque após o primeiro acesso)`);
    else if (!env.ADMIN_SENHA) console.log(` Senha (aparece só desta vez): ${senha}`);
    console.log(' Entre, cadastre as centrais/baias e crie os demais usuários.');
    console.log('==================================================================');
  }
}

const aqui = path.dirname(fileURLToPath(import.meta.url));
const webDir = env.WEB_DIR ?? path.resolve(aqui, '../../web/dist');
const app = criarApp({
  db,
  cfg,
  segredo: carregarSegredo(),
  cookieSeguro: env.COOKIE_SECURE === '1',
  confiarProxy: env.TRUST_PROXY === '1',
  webDir,
  demo,
});

const porta = inteiro(env.PORT, 3000);
const servidor = app.listen(porta, '0.0.0.0', () => {
  console.log(`Checklist de Baias em http://0.0.0.0:${porta}  (fuso ${turno.tz}, turnos ${turno.diaInicioHora}h/${turno.noiteInicioHora}h${demo ? ', MODO DEMONSTRAÇÃO' : ''})`);
});
const encerrar = () => {
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
