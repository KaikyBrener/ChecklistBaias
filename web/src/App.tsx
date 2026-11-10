import { useEffect, useState } from 'react';
import { ErroApi, PAPEL_ROTULO, fmtData, get, post, type Sessao } from './api';
import { SessaoCtx, useRota } from './ctx';
import { Painel } from './pages/Painel';
import { Checklist } from './pages/Checklist';
import { Ocorrencias } from './pages/Ocorrencias';
import { Cadastro } from './pages/Cadastro';
import { Carregando } from './components/Estado';
import { Icone, type NomeIcone } from './components/Icone';
import { BotaoTema } from './components/Tema';
import { Aviso } from './components/Aviso';

function IconeMarca() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" />
      <path d="M14.5 17.5l2.2 2.2 4-4.4" />
    </svg>
  );
}

function Marca() {
  return (
    <span className="marca">
      <span className="logo" aria-hidden="true"><IconeMarca /></span>
      <span className="marca-txt"><b>Checklist de baias</b><small>Centrais de monitoramento</small></span>
    </span>
  );
}

/** Relógio do turno: só exibição (a lógica do turno vem do servidor). */
function TurnoCard({ turno, inicio, fim, tz }: { turno: 'DIA' | 'NOITE'; inicio: string; fim: string; tz: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ini = new Date(inicio).getTime(), end = new Date(fim).getTime();
  const pct = Math.max(0, Math.min(100, ((agora - ini) / (end - ini)) * 100));
  const falta = Math.max(0, Math.round((end - agora) / 60000));
  return (
    <div className={'turno-chip ' + (turno === 'DIA' ? 'dia' : 'noite')} title="Turno em andamento">
      <div className="turno-topo"><span>Turno em andamento</span><span className="aovivo"><i aria-hidden="true" />ao vivo</span></div>
      <b className="turno-nome"><Icone nome={turno === 'DIA' ? 'sol' : 'lua'} />{turno === 'DIA' ? 'Dia' : 'Noite'} · {fmtData(inicio, tz, 'hora')}–{fmtData(fim, tz, 'hora')}</b>
      <div className="turno-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Andamento do turno"><i style={{ width: pct + '%' }} /></div>
      <small>Termina em {Math.floor(falta / 60)} h {String(falta % 60).padStart(2, '0')} min</small>
    </div>
  );
}

function Login({ onEntrou }: { onEntrou: () => void }) {
  const [pub, setPub] = useState<{ demo: boolean; contas: Array<{ login: string; nome: string; papel: keyof typeof PAPEL_ROTULO }>; senhaDemo: string | null } | null>(null);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { get('/publico').then(setPub).catch(() => {}); }, []);
  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try { await post('/auth/login', { login, senha }); onEntrou(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Não foi possível conectar ao servidor.'); }
    finally { setEnviando(false); }
  }
  return (
    <div className="login">
      <aside className="login-arte" aria-hidden="true">
        <Marca />
        <div className="login-meio">
          <h2>Cada turno,<br />cada baia,<br />tudo registrado.</h2>
          <p>Confira os equipamentos na troca de turno e acompanhe cada defeito até o conserto.</p>
        </div>
        <div className="login-baias">
          {Array.from({ length: 25 }, (_, i) => (
            <i key={i} className={[3, 8, 13, 14, 22].includes(i) ? 'at' : i === 17 ? 'pa' : [0, 6, 11, 19, 24, 27].includes(i) ? 'ok' : ''} style={{ animationDelay: `${(i * 137) % 1800}ms` }} />
          ))}
        </div>
      </aside>
      <div className="login-lado">
        <BotaoTema className="login-tema" />
        <form className="card login-caixa" onSubmit={entrar}>
          <div>
            <h1>Entrar</h1>
            <p className="muted">Use o usuário e a senha que o administrador criou para você.</p>
          </div>
          {pub?.demo && (
            <div className="aviso small">
              <b>Modo demonstração.</b> Os dados são fictícios. Escolha um perfil:
              <div className="contas">
                {pub.contas.map((c) => (
                  <button type="button" key={c.login} className="btn peq" onClick={() => { setLogin(c.login); setSenha(pub.senhaDemo ?? ''); }}>
                    {PAPEL_ROTULO[c.papel]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="campo">Usuário<input type="text" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus /></label>
          <label className="campo">Senha<input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <button className="btn prim" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  );
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

  if (sessao === undefined) return <Carregando />;
  if (sessao === null) return <Login onEntrou={carregar} />;

  const papel = sessao.usuario.papel;
  const abas = [
    ...(papel === 'COORDENADOR' || papel === 'ADMIN' ? [{ id: '/checklist', nome: 'Checklist' }] : []),
    { id: '/painel', nome: 'Painel' },
    { id: '/ocorrencias', nome: 'Ocorrências' },
    ...(papel === 'ADMIN' ? [{ id: '/cadastro', nome: 'Cadastro' }] : []),
  ];
  const inicio = abas[0]!.id;
  const caminho = '/' + (rota.split('/')[1] ?? '');
  const ativa = abas.find((a) => a.id === caminho) ?? abas.find((a) => a.id === inicio)!;
  const t = sessao.turnoAtual;

  async function sair() { await post('/auth/logout'); setSessao(null); location.hash = ''; }

  let tela;
  if (ativa.id === '/checklist') tela = <Checklist rota={rota} />;
  else if (ativa.id === '/ocorrencias') tela = <Ocorrencias />;
  else if (ativa.id === '/cadastro') tela = <Cadastro />;
  else tela = <Painel />;

  return (
    <SessaoCtx.Provider value={sessao}>
      <div className="app">
        <aside className="lateral">
          <Marca />
          <nav className="nav" aria-label="Seções">
            {abas.map((a) => <a key={a.id} href={'#' + a.id} aria-current={a.id === ativa.id ? 'page' : undefined}><Icone nome={a.id.slice(1) as NomeIcone} />{a.nome}</a>)}
          </nav>
          <TurnoCard turno={t.turno} inicio={t.inicio} fim={t.fim} tz={sessao.tz} />
          <div className="quem">
            <span className="avatar" aria-hidden="true">{sessao.usuario.nome.trim().charAt(0).toUpperCase()}</span>
            <span className="quem-nome"><b>{sessao.usuario.nome}</b><small>{PAPEL_ROTULO[papel]}</small></span>
            <BotaoTema />
            <button className="icone-btn" onClick={sair} title="Sair do sistema" aria-label="Sair do sistema"><Icone nome="sair" /></button>
          </div>
        </aside>
        <div className="conteudo">
          {sessao.demo && <div className="faixa-demo">Demonstração com dados fictícios</div>}
          <main>{tela}</main>
        </div>
      </div>
    </SessaoCtx.Provider>
  );
}
