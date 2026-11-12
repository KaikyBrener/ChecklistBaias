import { useEffect, useRef, useState } from 'react';
import { post } from '../api';
import { Aviso } from './Aviso';
import { Campo } from './Campo';
import { Icone } from './Icone';

/** Janela para a pessoa trocar a própria senha. As outras sessões dela caem; esta continua. */
export function TrocarSenha({ onFechar }: { onFechar: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repete, setRepete] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);

  useEffect(() => { dlg.current?.showModal(); }, []);

  const diferente = repete.length > 0 && repete !== nova ? 'As duas senhas não são iguais.' : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (nova !== repete) return;
    setEnviando(true); setErro('');
    try { await post('/auth/senha', { atual, nova }); setFeito(true); }
    catch (x) { setErro((x as Error).message || 'Não foi possível trocar a senha.'); }
    finally { setEnviando(false); }
  }

  const tipo = ver ? 'text' : 'password';
  return (
    <dialog ref={dlg} className="janela" aria-labelledby="titulo-trocar-senha" onClose={onFechar}
      onClick={(e) => { if (e.target === dlg.current) dlg.current?.close(); }}>
      <form className="janela-corpo" onSubmit={salvar} aria-busy={enviando}>
        <div className="janela-cab">
          <h2 id="titulo-trocar-senha">Trocar minha senha</h2>
          <button type="button" className="aviso-fechar" onClick={() => dlg.current?.close()} aria-label="Fechar"><Icone nome="fechar" tamanho={18} /></button>
        </div>
        {feito ? (
          <>
            <Aviso tom="sucesso">Senha trocada. Se você estava conectado em outro aparelho, lá será preciso entrar de novo.</Aviso>
            <button type="button" className="btn prim" onClick={() => dlg.current?.close()} autoFocus>Concluir</button>
          </>
        ) : (
          <>
            <Campo rotulo="Senha atual">
              {(p) => <input {...p} type={tipo} name="senha-atual" autoComplete="current-password" value={atual} onChange={(e) => setAtual(e.target.value)} required maxLength={200} autoFocus />}
            </Campo>
            <Campo rotulo="Nova senha" dica="Mínimo 8 caracteres.">
              {(p) => <input {...p} type={tipo} name="nova-senha" autoComplete="new-password" value={nova} onChange={(e) => setNova(e.target.value)} required minLength={8} maxLength={200} />}
            </Campo>
            <Campo rotulo="Repita a nova senha" erro={diferente}>
              {(p) => <input {...p} type={tipo} name="repete-senha" autoComplete="new-password" value={repete} onChange={(e) => setRepete(e.target.value)} required minLength={8} maxLength={200} />}
            </Campo>
            <label className="marcar"><input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />Mostrar as senhas</label>
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <div className="linha">
              <button className="btn prim" disabled={enviando || !!diferente}>{enviando ? 'Salvando…' : 'Trocar senha'}</button>
              <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancelar</button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
