import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type Db = Database.Database;

export const STATUS_ABERTOS = ['ABERTA', 'EM_MANUTENCAO', 'AGUARDANDO_PECA'] as const;

const SCHEMA_V1 = `
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('ADMIN','TI','COORDENADOR','GERENTE')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

CREATE TABLE centrais (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE baias (
  id INTEGER PRIMARY KEY,
  central_id INTEGER NOT NULL REFERENCES centrais(id),
  numero INTEGER NOT NULL,
  ativa INTEGER NOT NULL DEFAULT 1,
  UNIQUE (central_id, numero)
);

CREATE TABLE tipos_equipamento (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE equipamentos (
  id INTEGER PRIMARY KEY,
  baia_id INTEGER NOT NULL REFERENCES baias(id),
  tipo_id INTEGER NOT NULL REFERENCES tipos_equipamento(id),
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (baia_id, nome)
);

CREATE TABLE checklists (
  id INTEGER PRIMARY KEY,
  central_id INTEGER NOT NULL REFERENCES centrais(id),
  dia_operacional TEXT NOT NULL,
  turno TEXT NOT NULL CHECK (turno IN ('DIA','NOITE')),
  status TEXT NOT NULL CHECK (status IN ('EM_ANDAMENTO','CONCLUIDO')),
  iniciado_por INTEGER NOT NULL REFERENCES usuarios(id),
  iniciado_em TEXT NOT NULL,
  concluido_em TEXT,
  UNIQUE (central_id, dia_operacional, turno)
);

CREATE TABLE ocorrencias (
  id INTEGER PRIMARY KEY,
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id),
  severidade TEXT NOT NULL CHECK (severidade IN ('DEGRADADO','INOPERANTE')),
  descricao TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA','RESOLVIDA','CANCELADA')),
  aberta_em TEXT NOT NULL,
  aberta_por INTEGER NOT NULL REFERENCES usuarios(id),
  checklist_id INTEGER REFERENCES checklists(id),
  turno TEXT NOT NULL,
  dia_operacional TEXT NOT NULL,
  resolvida_em TEXT
);
-- No máximo UMA ocorrência em aberto por equipamento: o mesmo defeito não é registrado duas vezes.
CREATE UNIQUE INDEX ux_ocorrencia_aberta_por_equipamento
  ON ocorrencias(equipamento_id) WHERE status IN ('ABERTA','EM_MANUTENCAO','AGUARDANDO_PECA');
CREATE INDEX ix_ocorrencias_aberta_em ON ocorrencias(aberta_em);

CREATE TABLE checklist_itens (
  id INTEGER PRIMARY KEY,
  checklist_id INTEGER NOT NULL REFERENCES checklists(id),
  equipamento_id INTEGER NOT NULL REFERENCES equipamentos(id),
  resultado TEXT NOT NULL CHECK (resultado IN ('OK','DEFEITO','NA')),
  severidade TEXT CHECK (severidade IN ('DEGRADADO','INOPERANTE')),
  observacao TEXT NOT NULL DEFAULT '',
  efeito TEXT CHECK (efeito IN ('ABERTA','CONFIRMADA','RESOLVIDA')),
  ocorrencia_id INTEGER REFERENCES ocorrencias(id),
  registrado_em TEXT NOT NULL,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  UNIQUE (checklist_id, equipamento_id)
);

-- Log de auditoria: só se acrescenta. Um erro é corrigido com um novo evento, nunca editando o antigo.
CREATE TABLE ocorrencia_eventos (
  id INTEGER PRIMARY KEY,
  ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencias(id),
  em TEXT NOT NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('ABERTA','CONFIRMADA','STATUS','RESOLVIDA','REABERTA','CANCELADA','SEVERIDADE','EDITADA','NOTA')),
  de_status TEXT,
  para_status TEXT,
  nota TEXT NOT NULL DEFAULT ''
);
CREATE INDEX ix_eventos_ocorrencia ON ocorrencia_eventos(ocorrencia_id, id);
CREATE TRIGGER eventos_sem_update BEFORE UPDATE ON ocorrencia_eventos
  BEGIN SELECT RAISE(ABORT, 'ocorrencia_eventos é somente de acréscimo'); END;
CREATE TRIGGER eventos_sem_delete BEFORE DELETE ON ocorrencia_eventos
  BEGIN SELECT RAISE(ABORT, 'ocorrencia_eventos é somente de acréscimo'); END;
`;

export function abrirBanco(arquivo: string): Db {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrar(db);
  return db;
}

function migrar(db: Db): void {
  const versao = db.pragma('user_version', { simple: true }) as number;
  if (versao < 1) {
    db.transaction(() => {
      db.exec(SCHEMA_V1);
      db.pragma('user_version = 1');
    })();
  }
  if (versao < 2) {
    // Versão da sessão: sair, trocar a senha ou desativar a conta aumenta o número e derruba os tokens antigos.
    db.transaction(() => {
      db.exec('ALTER TABLE usuarios ADD COLUMN sessao_versao INTEGER NOT NULL DEFAULT 0');
      db.pragma('user_version = 2');
    })();
  }
}
