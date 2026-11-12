import { useState } from 'react';
import { PAPEL_ROTULO, get, patch, post, type Papel } from '../api';
import { useDados } from '../ctx';
import { Aviso } from '../components/Aviso';
import { Campo } from '../components/Campo';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone } from '../components/Icone';
import { CabecalhoPagina, Secao } from '../components/Pagina';
import { Selo } from '../components/Selo';
import { BaiasDaCentral } from './CadastroBaias';

interface Central { id: number; nome: string; ativa: number; baias: number; equipamentos: number }
interface Usuario { id: number; nome: string; login: string; papel: Papel; ativo: number }
type Retorno = { tom: 'sucesso' | 'erro'; texto: string } | null;

export function Cadastro() {
  return (
    <>
      <CabecalhoPagina titulo="Cadastro">Centrais, baias, equipamentos e quem pode entrar no sistema.</CabecalhoPagina>
      <div className="cadastro-grade"><Centrais /><Usuarios /></div>
    </>
  );
}

/* ================= centrais e baias ================= */

/** Mesmas regras do servidor (que continua sendo quem decide): 1 a 200, "até" ≥ "da", até 200 de uma vez. */
function erroDoIntervalo(de: string, ate: string): string | null {
  const a = Number(de), b = Number(ate);
  if (!de || !ate || !Number.isInteger(a) || !Number.isInteger(b)) return 'Use números inteiros.';
  if (a < 1) return 'A primeira baia é a 1.';
  if (b < a) return '“Até” precisa ser igual ou maior que “da”.';
  if (b - a > 199) return 'Adicione no máximo 200 baias de cada vez.';
  return null;
}

function Centrais() {
  const { dados, erro, recarregar } = useDados(() => get<Central[]>('/centrais'), []);
  const [nome, setNome] = useState('');
  const [retorno, setRetorno] = useState<Retorno>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  async function tentar(chave: string, fn: () => Promise<unknown>, sucesso: string) {
    setRetorno(null); setEnviando(chave);
    try { await fn(); setRetorno({ tom: 'sucesso', texto: sucesso }); recarregar(); return true; }
    catch (e) { setRetorno({ tom: 'erro', texto: (e as Error).message }); return false; }
    finally { setEnviando(null); }
  }

  return (
    <Secao titulo="Centrais e baias" descricao="Cada baia nova já vem com monitores, computador, headset, teclado e mouse, telefone e nobreak. Abra “Baias e equipamentos” para ajustar o que cada uma tem.">
      {retorno && <Aviso tom={retorno.tom} onFechar={() => setRetorno(null)}>{retorno.texto}</Aviso>}
      {erro && !dados ? <Falha mensagem={erro} onTentar={recarregar} /> : !dados ? <Carregando texto="Carregando centrais…" /> : dados.length === 0 ? (
        <Vazio icone="predio" titulo="Nenhuma central ainda">Crie a primeira central abaixo e depois adicione as baias.</Vazio>
      ) : (
        <ul className="lista-cad">
          {dados.map((c) => <LinhaCentral key={c.id} c={c} ocupado={enviando === `c${c.id}`} onMudou={recarregar}
            onAdicionar={(de, ate) => tentar(`c${c.id}`, () => post(`/centrais/${c.id}/baias`, { de, ate }),
              de === ate ? `Baia ${de} adicionada à ${c.nome}.` : `Baias ${de} a ${ate} adicionadas à ${c.nome}.`)} />)}
        </ul>
      )}
      <form className="form-cad" onSubmit={(e) => { e.preventDefault(); const n = nome.trim(); tentar('nova', async () => { await post('/centrais', { nome: n }); setNome(''); }, `${n} criada. Agora adicione as baias dela.`); }}>
        <h3>Nova central</h3>
        <div className="form-linha">
          <Campo rotulo="Nome da central" className="cresce">
            {(p) => <input {...p} type="text" name="central" value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} maxLength={80} required placeholder="Ex.: Central 3" autoComplete="off" />}
          </Campo>
          <button className="btn prim" disabled={enviando === 'nova'}><Icone nome="mais" tamanho={16} />{enviando === 'nova' ? 'Criando…' : 'Criar central'}</button>
        </div>
      </form>
    </Secao>
  );
}

function LinhaCentral({ c, ocupado, onAdicionar, onMudou }: { c: Central; ocupado: boolean; onAdicionar: (de: number, ate: number) => Promise<boolean>; onMudou: () => void }) {
  const [verBaias, setVerBaias] = useState(false);
  const [versao, setVersao] = useState(0); // recarrega a lista de baias quando novas são adicionadas
  const proxima = String(c.baias + 1);
  const [de, setDe] = useState(proxima);
  const [ate, setAte] = useState(proxima);
  const [tocado, setTocado] = useState(false);
  const erro = erroDoIntervalo(de, ate);
  const qtd = erro ? 0 : Number(ate) - Number(de) + 1;
  // o erro aparece junto do campo que precisa mudar
  const erroAte = tocado && erro && Number(ate) < Number(de) ? erro : null;
  const erroDe = tocado && erro && !erroAte ? erro : null;
  return (
    <li className="central-cad">
      <div className="central-cad-cab">
        <span className="central-cad-ico" aria-hidden="true"><Icone nome="predio" tamanho={18} /></span>
        <div className="central-cad-txt">
          <b>{c.nome}</b>
          <span className="muted small num">{c.baias} baias · {c.equipamentos} equipamentos</span>
        </div>
        {!c.ativa && <Selo>Inativa</Selo>}
        <button type="button" className="btn peq" aria-expanded={verBaias} onClick={() => setVerBaias(!verBaias)}>
          <Icone nome={verBaias ? 'baixo' : 'direita'} tamanho={15} />Baias e equipamentos
        </button>
      </div>
      <form className="form-linha" noValidate onSubmit={async (e) => {
        e.preventDefault(); setTocado(true);
        if (erro) return;
        if (await onAdicionar(Number(de), Number(ate))) { const n = String(Number(ate) + 1); setDe(n); setAte(n); setTocado(false); setVersao((v) => v + 1); }
      }}>
        <Campo rotulo="Adicionar baias, da" erro={erroDe}>
          {(p) => <input {...p} type="number" inputMode="numeric" min={1} value={de} onChange={(e) => setDe(e.target.value)} onBlur={() => setTocado(true)} />}
        </Campo>
        <Campo rotulo="até" erro={erroAte}>
          {(p) => <input {...p} type="number" inputMode="numeric" min={1} value={ate} onChange={(e) => setAte(e.target.value)} onBlur={() => setTocado(true)} />}
        </Campo>
        <button className="btn" disabled={ocupado}>{ocupado ? 'Adicionando…' : qtd > 1 ? `Adicionar ${qtd} baias` : 'Adicionar baia'}</button>
      </form>
      {verBaias && <BaiasDaCentral key={versao} centralId={c.id} onMudou={onMudou} />}
    </li>
  );
}

/* ================= usuários ================= */

function Usuarios() {
  const { dados, erro, recarregar } = useDados(() => get<Usuario[]>('/usuarios'), []);
  const [f, setF] = useState({ nome: '', login: '', senha: '', papel: 'COORDENADOR' as Papel });
  const [verSenha, setVerSenha] = useState(false);
  const [retorno, setRetorno] = useState<Retorno>(null);
  const [criando, setCriando] = useState(false);

  async function tentar(fn: () => Promise<unknown>, sucesso: string) {
    setRetorno(null);
    try { await fn(); setRetorno({ tom: 'sucesso', texto: sucesso }); recarregar(); return true; }
    catch (e) { setRetorno({ tom: 'erro', texto: (e as Error).message }); return false; }
  }
  async function criar(e: React.FormEvent) {
    e.preventDefault(); setCriando(true);
    const nome = f.nome.trim();
    if (await tentar(() => post('/usuarios', f), `${nome} pode entrar com o usuário “${f.login}”.`)) setF({ ...f, nome: '', login: '', senha: '' });
    setCriando(false);
  }

  const ativos = dados?.filter((u) => u.ativo).length ?? 0;
  return (
    <Secao titulo="Usuários" descricao={dados ? `${ativos} ativo${ativos === 1 ? '' : 's'} de ${dados.length}.` : undefined}>
      {retorno && <Aviso tom={retorno.tom} onFechar={() => setRetorno(null)}>{retorno.texto}</Aviso>}
      {erro && !dados ? <Falha mensagem={erro} onTentar={recarregar} /> : !dados ? <Carregando texto="Carregando usuários…" /> : (
        <ul className="lista-cad">{dados.map((u) => <LinhaUsuario key={u.id} u={u} tentar={tentar} />)}</ul>
      )}

      <form className="form-cad" onSubmit={criar}>
        <h3>Novo usuário</h3>
        <div className="form-grade">
          <Campo rotulo="Nome">
            {(p) => <input {...p} type="text" name="nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} maxLength={80} autoComplete="off" />}
          </Campo>
          <Campo rotulo="Usuário (para entrar)" dica="Mínimo 3 caracteres.">
            {(p) => <input {...p} type="text" name="login" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required minLength={3} maxLength={40}
              autoComplete="off" autoCapitalize="none" spellCheck={false} />}
          </Campo>
          <Campo rotulo="Senha inicial" dica="Mínimo 8 caracteres. Combine com a pessoa e peça para trocar no primeiro acesso.">
            {(p) => (
              <span className="senha">
                <input {...p} type={verSenha ? 'text' : 'password'} name="nova-senha" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} required minLength={8} maxLength={200} autoComplete="new-password" />
                <button type="button" className="senha-ver" onClick={() => setVerSenha(!verSenha)} aria-pressed={verSenha}>{verSenha ? 'Ocultar' : 'Mostrar'}</button>
              </span>
            )}
          </Campo>
          <Campo rotulo="Perfil">
            {(p) => (
              <select {...p} value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
                {(Object.keys(PAPEL_ROTULO) as Papel[]).map((x) => <option key={x} value={x}>{PAPEL_ROTULO[x]}</option>)}
              </select>
            )}
          </Campo>
        </div>
        <button className="btn prim" disabled={criando}><Icone nome="usuario" tamanho={16} />{criando ? 'Criando…' : 'Criar usuário'}</button>
      </form>
    </Secao>
  );
}

function LinhaUsuario({ u, tentar }: { u: Usuario; tentar: (fn: () => Promise<unknown>, sucesso: string) => Promise<boolean> }) {
  const [modo, setModo] = useState<'normal' | 'senha' | 'desativar'>('normal');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const agir = async (fn: () => Promise<unknown>, sucesso: string) => {
    setOcupado(true);
    if (await tentar(fn, sucesso)) { setModo('normal'); setSenha(''); }
    setOcupado(false);
  };
  return (
    <li className={'usuario-cad' + (u.ativo ? '' : ' inativo')}>
      <div className="usuario-cad-cab">
        <span className="usuario-avatar" aria-hidden="true">{u.nome.trim().charAt(0).toUpperCase()}</span>
        <div className="usuario-txt">
          <b title={u.nome}>{u.nome}</b>
          <span className="usuario-selos">
            <span className="muted small" translate="no">{u.login}</span>
            <Selo tom="papel">{PAPEL_ROTULO[u.papel]}</Selo>
            {!u.ativo && <Selo>Inativo</Selo>}
          </span>
        </div>
        {modo === 'normal' && (
          <div className="usuario-acoes">
            <button type="button" className="btn peq" onClick={() => setModo('senha')}><Icone nome="chave" tamanho={15} />Redefinir senha</button>
            {u.ativo
              ? <button type="button" className="btn peq ghost perigo" onClick={() => setModo('desativar')}>Desativar</button>
              : <button type="button" className="btn peq" disabled={ocupado} onClick={() => agir(() => patch(`/usuarios/${u.id}`, { ativo: true }), `${u.nome} foi reativado e já pode entrar.`)}>Reativar</button>}
          </div>
        )}
      </div>

      {modo === 'senha' && (
        <form className="usuario-painel" onSubmit={(e) => { e.preventDefault(); agir(() => patch(`/usuarios/${u.id}`, { senha }), `Senha de ${u.nome} alterada.`); }}>
          <Campo rotulo={`Nova senha de ${u.nome}`} dica="Mínimo 8 caracteres." className="cresce">
            {(p) => <input {...p} type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />}
          </Campo>
          <div className="linha">
            <button className="btn peq prim" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar senha'}</button>
            <button type="button" className="btn peq" onClick={() => { setModo('normal'); setSenha(''); }}>Cancelar</button>
          </div>
        </form>
      )}

      {modo === 'desativar' && (
        <div className="usuario-painel confirmar" role="group" aria-label={`Confirmar desativação de ${u.nome}`}>
          <p className="small"><b>Desativar {u.nome}?</b> O acesso é cortado na hora. Dá para reativar depois; o histórico fica guardado.</p>
          <div className="linha">
            <button type="button" className="btn peq perigo-forte" disabled={ocupado} autoFocus
              onClick={() => agir(() => patch(`/usuarios/${u.id}`, { ativo: false }), `${u.nome} foi desativado.`)}>{ocupado ? 'Desativando…' : 'Desativar acesso'}</button>
            <button type="button" className="btn peq" onClick={() => setModo('normal')}>Manter ativo</button>
          </div>
        </div>
      )}
    </li>
  );
}
