import { useState } from 'react';
import { Icone } from './Icone';

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

// Cor da barra do navegador no celular: a mesma da barra superior do app em cada tema.
const COR_BARRA: Record<Tema, string> = { claro: '#0f1b2d', escuro: '#070d17' };

function aplicar(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COR_BARRA[tema]);
}

/** Aplica o tema salvo antes da primeira tela (chamado em main.tsx) para não piscar. */
export function aplicarTemaSalvo() {
  aplicar(temaInicial());
}

export function BotaoTema({ className = '' }: { className?: string }) {
  const [tema, setTema] = useState<Tema>(() => (document.documentElement.dataset.tema as Tema) || temaInicial());
  const escuro = tema === 'escuro';
  function alternar() {
    const novo: Tema = escuro ? 'claro' : 'escuro';
    setTema(novo);
    aplicar(novo);
    try { localStorage.setItem(CHAVE_TEMA, novo); } catch { /* sem persistência */ }
  }
  return (
    <button
      type="button"
      className={'icone-btn ' + className}
      onClick={alternar}
      aria-label={escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
    >
      <Icone nome={escuro ? 'sol' : 'lua'} />
    </button>
  );
}
