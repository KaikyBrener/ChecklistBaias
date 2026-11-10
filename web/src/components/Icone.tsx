/** Ícones em SVG de traço único (24 × 24, traço 2). Desenhados para o projeto: nada é carregado de fora. */
const CAMINHOS = {
  // navegação
  checklist: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9',
  painel: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  ocorrencias: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
  cadastro: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  // estados
  parado: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM15 9l-6 6M9 9l6 6',
  alerta: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
  certo: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM8 12l3 3 5-6',
  visto: 'M5 12.5l4.5 4.5L19 7',
  circulo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  na: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12h8',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  relogio: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  repetir: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  // equipamentos
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  computador: 'M7 3h10v18H7zM10 7h4M10 11h4M12 17h.01',
  headset: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z',
  teclado: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  telefone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  nobreak: 'M3 7h16v10H3zM21 10v4M12 8.5l-2 3.5h3l-2 3.5',
  equipamento: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  // ações
  esquerda: 'M15 6l-6 6 6 6',
  direita: 'M9 6l6 6-6 6',
  baixo: 'M6 9l6 6 6-6',
  fechar: 'M6 6l12 12M18 6L6 18',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  atualizar: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  baixar: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  mais: 'M12 5v14M5 12h14',
  usuario: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  predio: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h3a1 1 0 0 1 1 1v11M2 21h20M8 7h4M8 11h4M8 15h4',
  nota: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  chave: 'M14.5 4a5.5 5.5 0 1 1-4.9 8L3 18.6V21h3v-2h2v-2h2l1.6-1.6A5.5 5.5 0 0 1 14.5 4zM16 8h.01',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  lua: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg className={className ? `ico ${className}` : 'ico'} viewBox="0 0 24 24" width={tamanho} height={tamanho} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}

/** Ícone do tipo de equipamento. Os tipos são editáveis no cadastro; tipo desconhecido usa o genérico. */
const POR_TIPO: Record<string, NomeIcone> = {
  monitor: 'monitor', computador: 'computador', headset: 'headset', 'teclado e mouse': 'teclado',
  teclado: 'teclado', telefone: 'telefone', nobreak: 'nobreak',
};
export function iconeDoTipo(tipo: string | undefined): NomeIcone {
  return POR_TIPO[(tipo ?? '').trim().toLowerCase()] ?? 'equipamento';
}
