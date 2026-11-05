import { useEffect, useState } from 'react';

/** Peças visuais pequenas e sem lógica de negócio. */
export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

const CAMINHOS: Record<string, string> = {
  '/checklist': 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9',
  '/painel': 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  '/ocorrencias': 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
  '/cadastro': 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  parado: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  relogio: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  certo: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l3 3 5-6',
  repetir: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  lua: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
};

export function Ico({ nome }: { nome: string }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[nome] ?? ''} />
    </svg>
  );
}

export function Voltar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="voltar" href={href}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
      {children}
    </a>
  );
}

/* ---------- tema claro / escuro ---------- */
type Tema = 'claro' | 'escuro';
const CHAVE_TEMA = 'cb_tema';

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem(CHAVE_TEMA);
    if (salvo === 'claro' || salvo === 'escuro') return salvo;
  } catch { /* armazenamento indisponível: usa a preferência do sistema */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

/** Aplica o tema salvo antes da primeira tela (chamado em main.tsx) para não piscar. */
export function aplicarTemaSalvo() {
  document.documentElement.dataset.tema = temaInicial();
}

export function BotaoTema({ className = '' }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.dataset.tema as Tema) || temaInicial());
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try { localStorage.setItem(CHAVE_TEMA, tema); } catch { /* sem persistência */ }
  }, [tema]);
  const escuro = tema === 'escuro';
  return (
    <button
      type="button"
      className={'icone-btn ' + className}
      onClick={() => setTema(escuro ? 'claro' : 'escuro')}
      aria-label={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
    >
      <Ico nome={escuro ? 'sol' : 'lua'} />
    </button>
  );
}
