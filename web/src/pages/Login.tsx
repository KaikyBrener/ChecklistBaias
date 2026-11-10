import { useEffect, useState } from 'react';
import { ErroApi, PAPEL_ROTULO, get, post, type Papel } from '../api';
import { Aviso } from '../components/Aviso';
import { Campo } from '../components/Campo';
import { Marca } from '../components/Marca';
import { BotaoTema } from '../components/Tema';

interface Publico { demo: boolean; contas: Array<{ login: string; nome: string; papel: Papel }>; senhaDemo: string | null }

// Desenho decorativo das baias: algumas com problema, uma parada. Fica fora do componente porque nunca muda.
const ESTADO_BAIA = (i: number) => ([3, 8, 13, 14, 22].includes(i) ? 'at' : i === 17 ? 'pa' : [0, 6, 11, 19, 24].includes(i) ? 'ok' : '');
const BAIAS_ARTE = (
  <div className="login-baias">
    {Array.from({ length: 25 }, (_, i) => <i key={i} className={ESTADO_BAIA(i)} />)}
  </div>
);

export function Login({ onEntrou }: { onEntrou: () => void }) {
  const [pub, setPub] = useState<Publico | null>(null);
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { get<Publico>('/publico').then(setPub).catch(() => {}); }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true); setErro('');
    try { await post('/auth/login', { login, senha }); onEntrou(); }
    catch (x) { setErro(x instanceof ErroApi ? x.message : 'Não foi possível conectar ao servidor. Confira a rede e tente de novo.'); }
    finally { setEnviando(false); }
  }

  return (
    <div className="login">
      <aside className="login-arte" aria-hidden="true">
        <Marca />
        <div className="login-meio">
          <h2>{'Cada turno, '}<br />{'cada baia, '}<br />tudo registrado.</h2>
          <p>Confira os equipamentos na troca de turno e acompanhe cada defeito até o conserto.</p>
        </div>
        {BAIAS_ARTE}
      </aside>
      <main className="login-lado">
        <BotaoTema className="login-tema" />
        <form className="card login-caixa" onSubmit={entrar} aria-busy={enviando}>
          <div className="cab-txt">
            <h1>Entrar</h1>
            <p className="muted">Use o usuário e a senha que o administrador criou para você.</p>
          </div>
          {pub?.demo && (
            <div className="demo-contas">
              <span><b>Modo demonstração.</b> Os dados são fictícios. Escolha um perfil:</span>
              <div className="contas">
                {pub.contas.map((c) => (
                  <button type="button" key={c.login} className="btn peq" aria-pressed={login === c.login}
                    onClick={() => { setLogin(c.login); setSenha(pub.senhaDemo ?? ''); }}>
                    {PAPEL_ROTULO[c.papel]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Campo rotulo="Usuário">
            {(p) => <input {...p} type="text" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />}
          </Campo>
          <Campo rotulo="Senha">
            {(p) => <input {...p} type="password" name="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />}
          </Campo>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <button className="btn prim" disabled={enviando}>{enviando ? <><span className="spinner claro" aria-hidden="true" />Entrando…</> : 'Entrar'}</button>
        </form>
      </main>
    </div>
  );
}
