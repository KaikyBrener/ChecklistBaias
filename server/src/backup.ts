/**
 * Backup consistente do banco, com o sistema no ar (API de backup do SQLite).
 * Uso: node dist/backup.js        (variáveis: DB_PATH, BACKUP_DIR, BACKUP_MANTER = quantas cópias guardar, padrão 14)
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const origem = process.env.DB_PATH ?? './data/checklist.db';
const pasta = process.env.BACKUP_DIR ?? path.join(path.dirname(path.resolve(origem)), 'backups');
const manter = Number(process.env.BACKUP_MANTER ?? 14);

if (!fs.existsSync(origem)) {
  console.error(`Banco não encontrado em ${origem}.`);
  process.exit(1);
}
fs.mkdirSync(pasta, { recursive: true });
const agora = new Date();
const p = (n: number) => String(n).padStart(2, '0');
const nome = `checklist-${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}.db`;
const destino = path.join(pasta, nome);

const db = new Database(origem, { readonly: true });
try {
  await db.backup(destino);
} finally {
  db.close();
}
const antigos = fs.readdirSync(pasta).filter((f) => /^checklist-\d{8}-\d{4}\.db$/.test(f)).sort().reverse().slice(manter);
for (const f of antigos) fs.rmSync(path.join(pasta, f));
console.log(`Backup criado: ${destino} (removidos ${antigos.length} antigos)`);
