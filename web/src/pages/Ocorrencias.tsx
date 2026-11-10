import { useDeferredValue, useMemo, useState } from 'react';
import { STATUS_ROTULO, fmtData, fmtDur, desde, get, post, type Severidade, type Status } from '../api';
import { useDados, useRota, useSessao } from '../ctx';
import { Aviso } from '../components/Aviso';
import { Campo } from '../components/Campo';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone, type NomeIcone } from '../components/Icone';
import { CabecalhoPagina, Voltar } from '../components/Pagina';
import { Segmento } from '../components/Segmento';
import { SeloSeveridade, SeloStatus } from '../components/Selo';

interface Linha {
  id: number; status: Status; severidade: Severidade; descricao: string; aberta_em: string; resolvida_em: string | null;
  equipamento: string; baia: number; central: string; turno: string;
}
interface Evento { id: number; em: string; tipo: string; de_status: Status | null; para_status: Status | null; nota: string; usuario: string }
type Situacao = 'abertas' | 'encerradas' | 'todas';
type Gravidade = 'todas' | Severidade;
type Ordem = 'recentes' | 'prioridade' | 'antigas';

const PROXIMOS: Record<string, Status[]> = {
  ABERTA: ['EM_MANUTENCAO', 'AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA'],
  EM_MANUTENCAO: ['AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_MANUTENCAO', 'RESOLVIDA', 'CANCELADA'],
  RESOLVIDA: ['ABERTA'],
  CANCELADA: [],
};
const ACAO: Record<Status, string> = { ABERTA: 'Reabrir', EM_MANUTENCAO: 'Assumir / em manutenção', AGUARDANDO_PECA: 'Aguardando peça', RESOLVIDA: 'Marcar como resolvida', CANCELADA: 'Cancelar (lançada por engano)' };
const SITUACOES = [{ valor: 'abertas', texto: 'Abertas' }, { valor: 'encerradas', texto: 'Encerradas' }, { valor: 'todas', texto: 'Todas' }] as const;
const estaAberta = (s: Status) => s !== 'RESOLVIDA' && s !== 'CANCELADA';
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Ocorrencias() {
  const rota = useRota();
  const { tz } = useSessao();
  const selecionada = Number(rota.split('/')[2]) || null;
  const [situacao, setSituacao] = useState<Situacao>('abertas');
  const [central, setCentral] = useState('');
  const [gravidade, setGravidade] = useState<Gravidade>('todas');
  const [ordem, setOrdem] = useState<Ordem>('recentes');
  const [busca, setBusca] = useState('');
  const buscaAdiada = useDeferredValue(busca); // digitação continua leve mesmo com a lista cheia

  const { dados: centrais } = useDados(() => get<Array<{ id: number; nome: string }>>('/centrais'), []);
  const { dados: lista, erro, carregando, recarregar } = useDados(
    () => get<Linha[]>(`/ocorrencias?situacao=${situacao}&limite=300${central ? `&central_id=${central}` : ''}${situacao === 'abertas' ? '' : '&dias=90'}`),
    [situacao, central],
  );

  // Busca, gravidade e ordem são locais: filtram o que o servidor já mandou, sem nova consulta.
  const visiveis = useMemo(() => {
    if (!lista) return [];
    const q = normalizar(buscaAdiada.trim());
    const filtrada = lista.filter((o) =>
      (gravidade === 'todas' || o.severidade === gravidade) &&
      (!q || normalizar(`${o.equipamento} ${o.descricao} ${o.central} baia ${o.baia}`).includes(q)));
    if (ordem === 'antigas') return filtrada.reverse();
    if (ordem === 'prioridade') {
      const peso = (o: Linha) => (estaAberta(o.status) ? (o.severidade === 'INOPERANTE' ? 0 : 1) : 2);
      return filtrada.sort((a, b) => peso(a) - peso(b) || a.aberta_em.localeCompare(b.aberta_em));
    }
    return filtrada;
  }, [lista, buscaAdiada, gravidade, ordem]);

  const filtrosLocais = gravidade !== 'todas' || busca.trim() !== '';
  const limpar = () => { setGravidade('todas'); setBusca(''); };

  return (
    <>
      <CabecalhoPagina titulo="Ocorrências">Cada equipamento com defeito tem uma ocorrência, que segue até ser resolvida.</CabecalhoPagina>

      <div className="filtros-oc" role="search" aria-label="Filtrar ocorrências">
        <div className="filtro-grupo">
          <span className="filtro-rotulo" aria-hidden="true">Mostrar</span>
          <Segmento rotulo="Situação" valor={situacao} onMudar={setSituacao} opcoes={SITUACOES} />
        </div>
        <Campo rotulo="Central">
          {(p) => (
            <select {...p} value={central} onChange={(e) => setCentral(e.target.value)}>
              <option value="">Todas</option>{centrais?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
        </Campo>
        <Campo rotulo="Gravidade">
          {(p) => (
            <select {...p} value={gravidade} onChange={(e) => setGravidade(e.target.value as Gravidade)}>
              <option value="todas">Todas</option><option value="INOPERANTE">Parado</option><option value="DEGRADADO">Com problema</option>
            </select>
          )}
        </Campo>
        <Campo rotulo="Ordenar por">
          {(p) => (
            <select {...p} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
              <option value="recentes">Mais recentes</option><option value="prioridade">Prioridade (parados e mais antigos)</option><option value="antigas">Mais antigas</option>
            </select>
          )}
        </Campo>
        <Campo rotulo="Buscar" className="filtro-busca">
          {(p) => (
            <span className="busca">
              <Icone nome="busca" tamanho={16} />
              <input {...p} type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Equipamento ou baia…" autoComplete="off" spellCheck={false} />
            </span>
          )}
        </Campo>
      </div>
      {situacao !== 'abertas' && <p className="muted small filtros-nota">Encerradas e todas mostram os últimos 90 dias.</p>}

      <div className={'duas' + (selecionada ? ' com-detalhe' : '')}>
        <section className="card lista-oc" aria-labelledby="h-lista-oc" aria-busy={carregando}>
          <div className="lista-oc-cab">
            <h2 id="h-lista-oc" className="sr">Lista de ocorrências</h2>
            {lista && (
              <p className="muted small num" role="status">
                {visiveis.length === lista.length ? `${lista.length} ocorrência${lista.length === 1 ? '' : 's'}` : `${visiveis.length} de ${lista.length} ocorrências`}
                {carregando && ' · atualizando…'}
              </p>
            )}
            {filtrosLocais && <button type="button" className="btn ghost peq" onClick={limpar}><Icone nome="fechar" tamanho={14} />Limpar filtros</button>}
          </div>
          {erro && !lista ? <Falha mensagem={erro} onTentar={recarregar} />
            : !lista ? <Carregando texto="Carregando ocorrências…" />
            : lista.length === 0 ? <Vazio tom="ok" icone="certo" titulo={`Nenhuma ocorrência ${situacao === 'abertas' ? 'aberta' : 'no período'}`}>{situacao === 'abertas' ? 'Todos os equipamentos estão funcionando.' : 'Tente outra central ou situação.'}</Vazio>
            : visiveis.length === 0 ? <Vazio icone="busca" titulo="Nada encontrado com esses filtros" acao={<button type="button" className="btn" onClick={limpar}>Limpar filtros</button>} />
            : (
              <div className="tabela-wrap"><table className="tabela-oc">
                <thead><tr><th scope="col">Equipamento</th><th scope="col">Local</th><th scope="col">Situação</th><th scope="col">Aberta</th></tr></thead>
                <tbody>{visiveis.map((o) => {
                  const aberta = estaAberta(o.status);
                  return (
                    <tr key={o.id} className={'clic' + (o.id === selecionada ? ' sel' : '') + (aberta && o.severidade === 'INOPERANTE' ? ' critica' : '')}
                      aria-current={o.id === selecionada ? 'true' : undefined} onClick={() => { location.hash = `#/ocorrencias/${o.id}`; }}>
                      <td>
                        <a href={`#/ocorrencias/${o.id}`} className="oc-equip">{o.equipamento}</a>
                        <div className="small muted oc-desc">{o.descricao}</div>
                      </td>
                      <td>{o.central}<div className="small muted">Baia {o.baia}</div></td>
                      <td><div className="oc-selos"><SeloStatus status={o.status} />{o.severidade === 'INOPERANTE' && aberta && <SeloSeveridade severidade="INOPERANTE" />}</div></td>
                      <td className="num">{fmtData(o.aberta_em, tz)}{aberta && <div className="small muted">há {fmtDur(desde(o.aberta_em))}</div>}</td>
                    </tr>
                  );
                })}</tbody></table></div>
            )}
        </section>
        {selecionada
          ? <Detalhe key={selecionada} id={selecionada} aoMudar={recarregar} />
          : <section className="card vazio-lateral"><Vazio icone="ocorrencias" titulo="Nenhuma ocorrência selecionada">Escolha uma ocorrência na lista para ver o histórico e atualizar o andamento.</Vazio></section>}
      </div>
    </>
  );
}

/* ================= detalhe: histórico e andamento ================= */

function rotuloEvento(ev: Evento): string {
  if (ev.tipo === 'NOTA') return 'Anotação';
  if (ev.tipo === 'CONFIRMADA') return 'Defeito continua';
  if (ev.para_status) return STATUS_ROTULO[ev.para_status];
  if (ev.tipo === 'SEVERIDADE') return 'Gravidade alterada';
  if (ev.tipo === 'EDITADA') return 'Registro corrigido';
  return ev.tipo;
}
function iconeEvento(ev: Evento): NomeIcone {
  if (ev.tipo === 'NOTA' || ev.tipo === 'EDITADA') return 'nota';
  if (ev.tipo === 'CONFIRMADA' || ev.tipo === 'REABERTA') return 'repetir';
  if (ev.para_status === 'RESOLVIDA') return 'certo';
  if (ev.para_status === 'CANCELADA') return 'fechar';
  if (ev.para_status === 'EM_MANUTENCAO' || ev.para_status === 'AGUARDANDO_PECA') return 'relogio';
  return 'alerta';
}

function Detalhe({ id, aoMudar }: { id: number; aoMudar: () => void }) {
  const { tz, usuario } = useSessao();
  const { dados: o, erro, recarregar } = useDados(() => get<Linha & { eventos: Evento[]; aberta_por: string }>(`/ocorrencias/${id}`), [id]);
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState('');
  const [feito, setFeito] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const podeStatus = usuario.papel === 'TI' || usuario.papel === 'ADMIN';

  async function agir(fn: () => Promise<unknown>, sucesso: string) {
    setOcupado(true); setMsg(''); setFeito('');
    try { await fn(); setNota(''); setFeito(sucesso); recarregar(); aoMudar(); }
    catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }

  const voltar = <Voltar href="#/ocorrencias">Voltar à lista</Voltar>;
  if (erro && !o) return <section className="card detalhe-oc">{voltar}<Falha mensagem={erro} onTentar={recarregar} /></section>;
  if (!o) return <section className="card detalhe-oc"><Carregando texto="Carregando ocorrência…" /></section>;

  const aberta = estaAberta(o.status);
  const proximos = podeStatus ? PROXIMOS[o.status] ?? [] : [];
  const textoNota = nota.trim();
  const semMotivo = textoNota.length < 3;
  return (
    <section className="card detalhe-oc" aria-labelledby="h-detalhe-oc">
      <div className="detalhe-voltar">{voltar}</div>
      <header className="detalhe-cab">
        <h2 id="h-detalhe-oc">{o.equipamento}</h2>
        <div className="oc-selos"><SeloStatus status={o.status} /><SeloSeveridade severidade={o.severidade} /></div>
      </header>
      {o.descricao && <p className="detalhe-desc">“{o.descricao}”</p>}

      <dl className="fatos">
        <div><dt>Local</dt><dd>{o.central} · Baia {o.baia}</dd></div>
        <div><dt>Aberta por</dt><dd>{o.aberta_por}</dd></div>
        <div><dt>Aberta em</dt><dd className="num">{fmtData(o.aberta_em, tz)}</dd></div>
        {aberta
          ? <div><dt>Aberta há</dt><dd className="num"><b>{fmtDur(desde(o.aberta_em))}</b></dd></div>
          : o.resolvida_em && <div><dt>Encerrada em</dt><dd className="num">{fmtData(o.resolvida_em, tz)}</dd></div>}
      </dl>

      <h3 className="detalhe-sub">Histórico</h3>
      <ol className="linha-tempo">
        {o.eventos.map((ev, i) => (
          <li key={ev.id} className={(ev.para_status === 'RESOLVIDA' ? 'fim' : '') + (i === o.eventos.length - 1 ? ' atual' : '')}>
            <span className="lt-ico" aria-hidden="true"><Icone nome={iconeEvento(ev)} tamanho={14} /></span>
            <div className="lt-corpo">
              <div><b>{rotuloEvento(ev)}</b>{ev.nota && <span className="lt-nota"> — {ev.nota}</span>}</div>
              <div className="small muted num">{fmtData(ev.em, tz)} · {ev.usuario}</div>
            </div>
          </li>))}
      </ol>

      <div className="detalhe-acoes">
        {msg && <Aviso tom="erro" onFechar={() => setMsg('')}>{msg}</Aviso>}
        {feito && <Aviso tom="sucesso" onFechar={() => setFeito('')}>{feito}</Aviso>}
        <Campo rotulo="Anotação" dica={podeStatus && proximos.length ? 'Vai junto com a mudança de situação. Para cancelar, escreva o motivo.' : undefined}>
          {(p) => <textarea {...p} value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: troquei o cabo, aguardando teste…" />}
        </Campo>
        <div className="linha">
          <button type="button" className="btn" disabled={ocupado || textoNota.length < 2}
            onClick={() => agir(() => post(`/ocorrencias/${id}/notas`, { nota: textoNota }), 'Anotação registrada.')}><Icone nome="nota" tamanho={16} />Só anotar</button>
          <span className="small muted num contador">{nota.length}/500</span>
        </div>
        {proximos.length > 0 && (
          <div className="acoes-status" role="group" aria-label="Mudar situação">
            {proximos.map((s) => (
              <button key={s} type="button" className={'btn' + (s === 'RESOLVIDA' ? ' prim' : s === 'CANCELADA' ? ' ghost perigo' : '')}
                disabled={ocupado || (s === 'CANCELADA' && semMotivo)}
                onClick={() => agir(() => post(`/ocorrencias/${id}/status`, { status: s, nota: textoNota }), `Situação alterada para “${STATUS_ROTULO[s]}”.`)}>{ACAO[s]}</button>
            ))}
          </div>
        )}
        {!podeStatus && <p className="muted small">Só a TI altera a situação. Você pode deixar anotações.</p>}
      </div>
    </section>
  );
}
