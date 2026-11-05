import { useState } from 'react';
import { PAPEL_ROTULO, get, patch, post, type Papel } from '../api';
import { useDados } from '../ctx';

export function Cadastro() {
  return (
    <>
      <div className="cab"><div><h1>Cadastro</h1><p className="muted">Centrais, baias e quem pode entrar no sistema.</p></div></div>
      <div className="grade g2"><Centrais /><Usuarios /></div>
    </>
  );
}

function Centrais() {
  const { dados, erro, recarregar } = useDados(() => get<Array<{ id: number; nome: string; ativa: number; baias: number; equipamentos: number }>>('/centrais'), []);
  const [nome, setNome] = useState('');
  const [msg, setMsg] = useState('');
  const [de, setDe] = useState<Record<number, { de: string; ate: string }>>({});
  async function tentar(fn: () => Promise<unknown>) { setMsg(''); try { await fn(); recarregar(); } catch (e) { setMsg((e as Error).message); } }
  return (
    <section className="card">
      <h2>Centrais e baias</h2>
      {erro && <div className="erro">{erro}</div>}{msg && <div className="erro" role="alert">{msg}</div>}
      {dados?.map((c) => {
        const f = de[c.id] ?? { de: String(c.baias + 1), ate: String(c.baias + 1) };
        return (
          <div key={c.id} className="baia-bloco"><header><h3>{c.nome}</h3><span className="muted small">{c.baias} baias · {c.equipamentos} equipamentos</span></header>
            <div className="item"><form className="filtros" onSubmit={(e) => { e.preventDefault(); tentar(() => post(`/centrais/${c.id}/baias`, { de: Number(f.de), ate: Number(f.ate) })); }}>
              <label className="campo">Adicionar baias, da<input type="number" min={1} value={f.de} onChange={(e) => setDe({ ...de, [c.id]: { ...f, de: e.target.value } })} /></label>
              <label className="campo">até<input type="number" min={1} value={f.ate} onChange={(e) => setDe({ ...de, [c.id]: { ...f, ate: e.target.value } })} /></label>
              <button className="btn">Adicionar</button>
            </form><p className="muted small">Cada baia nova já vem com monitores, computador, headset, teclado e mouse, telefone e nobreak.</p></div>
          </div>);
      })}
      <form className="filtros" onSubmit={(e) => { e.preventDefault(); tentar(async () => { await post('/centrais', { nome }); setNome(''); }); }}>
        <label className="campo">Nova central<input type="text" value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} required placeholder="Ex.: Central 3" /></label>
        <button className="btn prim">Criar central</button>
      </form>
    </section>
  );
}

function Usuarios() {
  const { dados, erro, recarregar } = useDados(() => get<Array<{ id: number; nome: string; login: string; papel: Papel; ativo: number }>>('/usuarios'), []);
  const [f, setF] = useState({ nome: '', login: '', senha: '', papel: 'COORDENADOR' as Papel });
  const [msg, setMsg] = useState('');
  const [redef, setRedef] = useState<{ id: number; senha: string } | null>(null);
  async function tentar(fn: () => Promise<unknown>) { setMsg(''); try { await fn(); recarregar(); return true; } catch (e) { setMsg((e as Error).message); return false; } }
  return (
    <section className="card">
      <h2>Usuários</h2>
      {erro && <div className="erro">{erro}</div>}{msg && <div className={msg.startsWith('Senha de') ? 'aviso' : 'erro'} role="alert">{msg}</div>}
      <div className="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th></th></tr></thead>
        <tbody>{dados?.map((u) => (
          <tr key={u.id} className={u.ativo ? '' : 'inativo'}><td><b>{u.nome}</b>{!u.ativo && <> <span className="selo">Inativo</span></>}</td><td className="muted">{u.login}</td><td><span className="selo papel">{PAPEL_ROTULO[u.papel]}</span></td>
            <td>{redef?.id === u.id ? (
              <form className="linha" onSubmit={async (e) => { e.preventDefault(); if (await tentar(() => patch(`/usuarios/${u.id}`, { senha: redef.senha }))) { setRedef(null); setMsg(`Senha de ${u.nome} alterada.`); } }}>
                <input type="password" aria-label={`Nova senha de ${u.nome}`} autoComplete="new-password" minLength={8} required value={redef.senha} onChange={(e) => setRedef({ id: u.id, senha: e.target.value })} placeholder="Nova senha (8+)" />
                <button className="btn peq prim">Salvar</button><button type="button" className="btn peq" onClick={() => setRedef(null)}>Cancelar</button>
              </form>
            ) : <div className="linha"><button className="btn peq" onClick={() => setRedef({ id: u.id, senha: '' })}>Redefinir senha</button>{u.ativo ? <button className="btn peq" onClick={() => tentar(() => patch(`/usuarios/${u.id}`, { ativo: false }))}>Desativar</button> : <button className="btn peq" onClick={() => tentar(() => patch(`/usuarios/${u.id}`, { ativo: true }))}>Reativar</button>}</div>}</td></tr>))}</tbody></table></div>
      <h3 className="sep">Novo usuário</h3>
      <form className="grade" onSubmit={(e) => { e.preventDefault(); tentar(async () => { await post('/usuarios', f); setF({ ...f, nome: '', login: '', senha: '' }); }); }}>
        <label className="campo">Nome<input type="text" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} /></label>
        <label className="campo">Usuário (para entrar)<input type="text" value={f.login} onChange={(e) => setF({ ...f, login: e.target.value })} required minLength={3} autoComplete="off" /></label>
        <label className="campo">Senha inicial (mínimo 8 caracteres)<input type="password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
        <label className="campo">Perfil
          <select value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value as Papel })}>
            {(Object.keys(PAPEL_ROTULO) as Papel[]).map((p) => <option key={p} value={p}>{PAPEL_ROTULO[p]}</option>)}
          </select></label>
        <button className="btn prim">Criar usuário</button>
      </form>
    </section>
  );
}
