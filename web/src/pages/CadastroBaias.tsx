import { useState } from 'react';
import { get, patch, post } from '../api';
import { useDados } from '../ctx';
import { Aviso } from '../components/Aviso';
import { Campo } from '../components/Campo';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone, iconeDoTipo } from '../components/Icone';
import { Selo } from '../components/Selo';

interface Equip { id: number; nome: string; tipo: string; ativo: boolean }
interface Baia { id: number; numero: number; ativa: boolean; equipamentos: Equip[] }
interface Detalhe { id: number; nome: string; ativa: boolean; baias: Baia[] }
interface Tipo { id: number; nome: string }
type Retorno = { tom: 'sucesso' | 'erro'; texto: string } | null;
type Agir = (fn: () => Promise<unknown>, sucesso: string) => Promise<boolean>;

const NOVO_TIPO = 'novo';

/** Baias de uma central e os equipamentos de cada uma: renomear, desativar, reativar e adicionar. */
export function BaiasDaCentral({ centralId, onMudou }: { centralId: number; onMudou: () => void }) {
  const { dados, erro, recarregar } = useDados(() => get<Detalhe>(`/centrais/${centralId}`), [centralId]);
  const tipos = useDados(() => get<Tipo[]>('/tipos'), []);
  const [aberta, setAberta] = useState<number | null>(null);
  const [retorno, setRetorno] = useState<Retorno>(null);

  const agir: Agir = async (fn, sucesso) => {
    setRetorno(null);
    try { await fn(); setRetorno({ tom: 'sucesso', texto: sucesso }); recarregar(); onMudou(); return true; }
    catch (e) { setRetorno({ tom: 'erro', texto: (e as Error).message }); return false; }
  };

  if (erro && !dados) return <Falha mensagem={erro} onTentar={recarregar} />;
  if (!dados) return <Carregando texto="Carregando baias…" />;
  if (dados.baias.length === 0) return <Vazio titulo="Nenhuma baia nesta central">Adicione as baias acima; cada uma já vem com os equipamentos padrão.</Vazio>;

  return (
    <div className="baias-cad">
      {retorno && <Aviso tom={retorno.tom} onFechar={() => setRetorno(null)}>{retorno.texto}</Aviso>}
      <ul className="lista-cad">
        {dados.baias.map((b) => (
          <LinhaBaia key={b.id} b={b} aberta={aberta === b.id} onAlternar={() => setAberta(aberta === b.id ? null : b.id)}
            tipos={tipos.dados ?? []} onTipoNovo={tipos.recarregar} agir={agir} />
        ))}
      </ul>
    </div>
  );
}

function LinhaBaia({ b, aberta, onAlternar, tipos, onTipoNovo, agir }: {
  b: Baia; aberta: boolean; onAlternar: () => void; tipos: Tipo[]; onTipoNovo: () => void; agir: Agir;
}) {
  const [ocupado, setOcupado] = useState(false);
  const ativos = b.equipamentos.filter((e) => e.ativo).length;
  const idPainel = `baia-cad-${b.id}`;
  const comOcupado = async (fn: () => Promise<unknown>, sucesso: string) => {
    setOcupado(true);
    const ok = await agir(fn, sucesso);
    setOcupado(false);
    return ok;
  };
  return (
    <li className={'baia-cad' + (b.ativa ? '' : ' inativa')}>
      <button type="button" className="baia-cad-cab" aria-expanded={aberta} aria-controls={idPainel} onClick={onAlternar}>
        <Icone nome={aberta ? 'baixo' : 'direita'} tamanho={16} />
        <b className="num">Baia {b.numero}</b>
        <span className="muted small num">{ativos} equipamento{ativos === 1 ? '' : 's'}</span>
        {!b.ativa && <Selo>Inativa</Selo>}
      </button>
      {aberta && (
        <div className="baia-cad-painel" id={idPainel}>
          <ul className="equip-cad">
            {b.equipamentos.map((e) => <LinhaEquip key={e.id} e={e} baia={b.numero} agir={agir} />)}
          </ul>
          <NovoEquip baia={b} tipos={tipos} onTipoNovo={onTipoNovo} agir={agir} />
          <div className="baia-cad-rodape">
            {b.ativa ? (
              <button type="button" className="btn peq ghost perigo" disabled={ocupado}
                onClick={() => comOcupado(() => patch(`/baias/${b.id}`, { ativa: false }), `Baia ${b.numero} desativada: saiu do checklist e do painel. O histórico fica guardado.`)}>
                Desativar a baia {b.numero}
              </button>
            ) : (
              <button type="button" className="btn peq" disabled={ocupado}
                onClick={() => comOcupado(() => patch(`/baias/${b.id}`, { ativa: true }), `Baia ${b.numero} reativada.`)}>
                Reativar a baia {b.numero}
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function LinhaEquip({ e, baia, agir }: { e: Equip; baia: number; agir: Agir }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(e.nome);
  const [ocupado, setOcupado] = useState(false);
  const fazer = async (fn: () => Promise<unknown>, sucesso: string) => {
    setOcupado(true);
    const ok = await agir(fn, sucesso);
    setOcupado(false);
    return ok;
  };

  if (editando) {
    return (
      <li className="equip-linha editando">
        <form className="form-linha" onSubmit={async (ev) => {
          ev.preventDefault();
          const n = nome.trim();
          if (n === e.nome) { setEditando(false); return; }
          if (await fazer(() => patch(`/equipamentos/${e.id}`, { nome: n }), `“${e.nome}” agora se chama “${n}” (baia ${baia}).`)) setEditando(false);
        }}>
          <Campo rotulo={`Novo nome de ${e.nome}`} className="cresce">
            {(p) => <input {...p} type="text" value={nome} onChange={(ev) => setNome(ev.target.value)} minLength={2} maxLength={60} required autoFocus autoComplete="off" />}
          </Campo>
          <button className="btn peq prim" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</button>
          <button type="button" className="btn peq" onClick={() => { setEditando(false); setNome(e.nome); }}>Cancelar</button>
        </form>
      </li>
    );
  }
  return (
    <li className={'equip-linha' + (e.ativo ? '' : ' inativo')}>
      <span className="equip-ico" aria-hidden="true"><Icone nome={iconeDoTipo(e.tipo)} tamanho={16} /></span>
      <span className="equip-txt">
        <b title={e.nome}>{e.nome}</b>
        <span className="muted small">{e.tipo}{!e.ativo && ' · fora do checklist'}</span>
      </span>
      <span className="equip-acoes">
        <button type="button" className="btn peq ghost" onClick={() => setEditando(true)} aria-label={`Renomear ${e.nome}`}>Renomear</button>
        {e.ativo ? (
          <button type="button" className="btn peq ghost perigo" disabled={ocupado} aria-label={`Desativar ${e.nome}`}
            onClick={() => fazer(() => patch(`/equipamentos/${e.id}`, { ativo: false }), `${e.nome} da baia ${baia} saiu do checklist. O histórico fica guardado.`)}>Desativar</button>
        ) : (
          <button type="button" className="btn peq" disabled={ocupado} aria-label={`Reativar ${e.nome}`}
            onClick={() => fazer(() => patch(`/equipamentos/${e.id}`, { ativo: true }), `${e.nome} da baia ${baia} voltou ao checklist.`)}>Reativar</button>
        )}
      </span>
    </li>
  );
}

function NovoEquip({ baia, tipos, onTipoNovo, agir }: { baia: Baia; tipos: Tipo[]; onTipoNovo: () => void; agir: Agir }) {
  const [tipo, setTipo] = useState('');
  const [tipoNovo, setTipoNovo] = useState('');
  const [nome, setNome] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function adicionar(ev: React.FormEvent) {
    ev.preventDefault();
    setOcupado(true);
    const n = nome.trim();
    const ok = await agir(async () => {
      let tipoId = Number(tipo);
      if (tipo === NOVO_TIPO) {
        tipoId = (await post<{ id: number }>('/tipos', { nome: tipoNovo.trim() })).id;
        onTipoNovo();
      }
      await post(`/baias/${baia.id}/equipamentos`, { tipo_id: tipoId, nome: n });
    }, `${n} adicionado à baia ${baia.numero}. Entra no próximo checklist.`);
    if (ok) { setNome(''); setTipoNovo(''); if (tipo === NOVO_TIPO) setTipo(''); }
    setOcupado(false);
  }

  return (
    <form className="form-cad equip-novo" onSubmit={adicionar}>
      <h3>Adicionar equipamento à baia {baia.numero}</h3>
      <div className="form-grade">
        <Campo rotulo="Tipo">
          {(p) => (
            <select {...p} value={tipo} required onChange={(ev) => {
              const v = ev.target.value;
              setTipo(v);
              // sugere o nome do tipo, que é o caso mais comum ("Telefone", "Nobreak")
              const t = tipos.find((x) => String(x.id) === v);
              if (t && !nome.trim()) setNome(t.nome);
            }}>
              <option value="" disabled>Escolha…</option>
              {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              <option value={NOVO_TIPO}>Outro tipo…</option>
            </select>
          )}
        </Campo>
        {tipo === NOVO_TIPO && (
          <Campo rotulo="Nome do novo tipo" dica="Ex.: Webcam, Pedal, Rádio.">
            {(p) => <input {...p} type="text" value={tipoNovo} onChange={(ev) => setTipoNovo(ev.target.value)} minLength={2} maxLength={40} required autoComplete="off" />}
          </Campo>
        )}
        <Campo rotulo="Nome na baia" dica="Como aparece no checklist. Ex.: Monitor 3.">
          {(p) => <input {...p} type="text" value={nome} onChange={(ev) => setNome(ev.target.value)} minLength={2} maxLength={60} required autoComplete="off" />}
        </Campo>
      </div>
      <button className="btn" disabled={ocupado}><Icone nome="mais" tamanho={16} />{ocupado ? 'Adicionando…' : 'Adicionar equipamento'}</button>
    </form>
  );
}
