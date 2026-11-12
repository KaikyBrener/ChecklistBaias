import { useEffect, useRef, useState } from 'react';
import { PAPEL_ROTULO, get, post, type Papel, type Sessao } from './api';
import { SessaoCtx, useRota } from './ctx';
import { Painel } from './pages/Painel';
import { Checklist } from './pages/Checklist';
import { Ocorrencias } from './pages/Ocorrencias';
import { Cadastro } from './pages/Cadastro';
import { Login } from './pages/Login';
import { Carregando } from './components/Estado';
import { Icone, type NomeIcone } from './components/Icone';
import { Marca } from './components/Marca';
import { TurnoCard } from './components/TurnoCard';
import { BotaoTema } from './components/Tema';
import { TrocarSenha } from './components/TrocarSenha';

interface Aba { id: '/checklist' | '/painel' | '/ocorrencias' | '/cadastro'; nome: string; icone: NomeIcone }

/** Seções que cada perfil vê (a permissão de verdade é sempre conferida no servidor). */
function abasDoPapel(papel: Papel): Aba[] {
  return [
    ...(papel === 'COORDENADOR' || papel === 'ADMIN' ? [{ id: '/checklist', nome: 'Checklist', icone: 'checklist' } as const] : []),
    { id: '/painel', nome: 'Painel', icone: 'painel' },
    { id: '/ocorrencias', nome: 'Ocorrências', icone: 'ocorrencias' },
    ...(papel === 'ADMIN' ? [{ id: '/cadastro', nome: 'Cadastro', icone: 'cadastro' } as const] : []),
  ];
}

export function App() {
  const [sessao, setSessao] = useState<Sessao | null | undefined>(undefined);
  const rota = useRota();
  const carregar = () => get<Sessao>('/auth/me').then(setSessao).catch(() => setSessao(null));
  useEffect(() => { carregar(); }, []);
  useEffect(() => { // mantém o turno do cabeçalho atualizado
    if (!sessao) return;
    const t = setInterval(carregar, 5 * 60000);
    return () => clearInterval(t);
  }, [!!sessao]);

  if (sessao === undefined) return <div className="tela-inteira"><Carregando /></div>;
  if (sessao === null) return <Login onEntrou={carregar} />;

  async function sair() { await post('/auth/logout'); setSessao(null); location.hash = ''; }
  return (
    <SessaoCtx.Provider value={sessao}>
      <Estrutura sessao={sessao} rota={rota} onSair={sair} />
    </SessaoCtx.Provider>
  );
}

function Estrutura({ sessao, rota, onSair }: { sessao: Sessao; rota: string; onSair: () => void }) {
  const papel = sessao.usuario.papel;
  const abas = abasDoPapel(papel);
  const caminho = '/' + (rota.split('/')[1] ?? '');
  const ativa = abas.find((a) => a.id === caminho) ?? abas[0]!;
  const t = sessao.turnoAtual;
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  // Ao trocar de seção: título da aba do navegador e foco no conteúdo (leitores de tela anunciam a nova tela).
  const main = useRef<HTMLElement>(null);
  const primeira = useRef(true);
  useEffect(() => {
    document.title = `${ativa.nome} — Checklist de baias`;
    if (primeira.current) { primeira.current = false; return; }
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [ativa.id, ativa.nome]);

  let tela;
  if (ativa.id === '/checklist') tela = <Checklist rota={rota} />;
  else if (ativa.id === '/ocorrencias') tela = <Ocorrencias />;
  else if (ativa.id === '/cadastro') tela = <Cadastro />;
  else tela = <Painel />;

  return (
    <div className="app">
      <a className="pular" href="#conteudo" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Pular para o conteúdo</a>
      <aside className="lateral">
        <Marca />
        <nav className="nav" aria-label="Seções">
          {abas.map((a) => (
            <a key={a.id} href={'#' + a.id} aria-current={a.id === ativa.id ? 'page' : undefined}><Icone nome={a.icone} />{a.nome}</a>
          ))}
        </nav>
        <TurnoCard turno={t.turno} inicio={t.inicio} fim={t.fim} tz={sessao.tz} />
        <div className="quem">
          {sessao.demo ? (
            <span className="quem-conta">
              <span className="avatar" aria-hidden="true">{sessao.usuario.nome.trim().charAt(0).toUpperCase()}</span>
              <span className="quem-nome"><b title={sessao.usuario.nome}>{sessao.usuario.nome}</b><small>{PAPEL_ROTULO[papel]}</small></span>
            </span>
          ) : (
            // O nome é o botão da conta: abre a troca da própria senha.
            <button type="button" className="quem-conta" onClick={() => setTrocandoSenha(true)} title="Trocar minha senha"
              aria-label={`${sessao.usuario.nome}, ${PAPEL_ROTULO[papel]}. Trocar minha senha`}>
              <span className="avatar" aria-hidden="true">{sessao.usuario.nome.trim().charAt(0).toUpperCase()}</span>
              <span className="quem-nome"><b>{sessao.usuario.nome}</b><small>Trocar senha</small></span>
            </button>
          )}
          <BotaoTema />
          <button type="button" className="icone-btn" onClick={onSair} title="Sair do sistema" aria-label="Sair do sistema"><Icone nome="sair" /></button>
        </div>
      </aside>
      <div className="conteudo">
        {sessao.demo && <div className="faixa-demo">Demonstração com dados fictícios</div>}
        <main id="conteudo" ref={main} tabIndex={-1}>{tela}</main>
      </div>
      {trocandoSenha && <TrocarSenha onFechar={() => setTrocandoSenha(false)} />}
    </div>
  );
}
