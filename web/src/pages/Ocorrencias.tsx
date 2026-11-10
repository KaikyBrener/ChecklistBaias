import { useEffect, useState } from 'react';
import { STATUS_ROTULO, fmtData, fmtDur, desde, get, post, type Severidade, type Status } from '../api';
import { useDados, useRota, useSessao } from '../ctx';
import { Aviso } from '../components/Aviso';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { CabecalhoPagina } from '../components/Pagina';
import { SeloSeveridade, SeloStatus } from '../components/Selo';

interface Linha {
  id: number; status: Status; severidade: Severidade; descricao: string; aberta_em: string; resolvida_em: string | null;
  equipamento: string; baia: number; central: string; turno: string;
}
interface Evento { id: number; em: string; tipo: string; de_status: Status | null; para_status: Status | null; nota: string; usuario: string }

const PROXIMOS: Record<string, Status[]> = {
  ABERTA: ['EM_MANUTENCAO', 'AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA'],
  EM_MANUTENCAO: ['AGUARDANDO_PECA', 'RESOLVIDA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_MANUTENCAO', 'RESOLVIDA', 'CANCELADA'],
  RESOLVIDA: ['ABERTA'],
  CANCELADA: [],
};
const ACAO: Record<Status, string> = { ABERTA: 'Reabrir', EM_MANUTENCAO: 'Assumir / em manutenção', AGUARDANDO_PECA: 'Aguardando peça', RESOLVIDA: 'Marcar como resolvida', CANCELADA: 'Cancelar (lançada por engano)' };

export function Ocorrencias() {
  const rota = useRota();
  const selecionada = Number(rota.split('/')[2]) || null;
  const [situacao, setSituacao] = useState('abertas');
  const [central, setCentral] = useState('');
  const { dados: centrais } = useDados(() => get<Array<{ id: number; nome: string }>>('/centrais'), []);
  const { dados: lista, erro, recarregar } = useDados(
    () => get<Linha[]>(`/ocorrencias?situacao=${situacao}&limite=300${central ? `&central_id=${central}` : ''}${situacao === 'abertas' ? '' : '&dias=90'}`),
    [situacao, central],
  );
  const { tz } = useSessao();
  return (
    <>
      <CabecalhoPagina titulo="Ocorrências">Cada equipamento com defeito tem uma ocorrência, que segue até ser resolvida.</CabecalhoPagina>
      <div className="filtros">
        <label className="campo">Mostrar
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="abertas">Abertas</option><option value="encerradas">Encerradas (90 dias)</option><option value="todas">Todas (90 dias)</option>
          </select></label>
        <label className="campo">Central
          <select value={central} onChange={(e) => setCentral(e.target.value)}>
            <option value="">Todas</option>{centrais?.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select></label>
      </div>
      <div className="duas">
        <section className="card">
          {erro && !lista ? <Falha mensagem={erro} onTentar={recarregar} /> : !lista ? <Carregando texto="Carregando ocorrências…" /> : lista.length === 0 ? <Vazio tom="ok" icone="certo" titulo={`Nenhuma ocorrência ${situacao === 'abertas' ? 'aberta' : 'no período'}`} /> : (
            <div className="tabela-wrap"><table>
              <thead><tr><th>Equipamento</th><th>Local</th><th>Situação</th><th>Aberta</th></tr></thead>
              <tbody>{lista.map((o) => (
                <tr key={o.id} className={'clic' + (o.id === selecionada ? ' sel' : '')} onClick={() => { location.hash = `#/ocorrencias/${o.id}`; }}>
                  <td><a href={`#/ocorrencias/${o.id}`}>{o.equipamento}</a><div className="small muted">{o.descricao}</div></td>
                  <td>{o.central}<div className="small muted">Baia {o.baia}</div></td>
                  <td><SeloStatus status={o.status} />{o.severidade === 'INOPERANTE' && o.status !== 'RESOLVIDA' && o.status !== 'CANCELADA' && <div className="small"><SeloSeveridade severidade="INOPERANTE" /></div>}</td>
                  <td className="num">{fmtData(o.aberta_em, tz)}</td>
                </tr>))}</tbody></table></div>
          )}
        </section>
        {selecionada ? <Detalhe id={selecionada} aoMudar={recarregar} /> : <section className="card vazio-lateral"><Vazio icone="ocorrencias" titulo="Nenhuma ocorrência selecionada">Escolha uma ocorrência na lista para ver o histórico e atualizar o andamento.</Vazio></section>}
      </div>
    </>
  );
}

function Detalhe({ id, aoMudar }: { id: number; aoMudar: () => void }) {
  const { tz, usuario } = useSessao();
  const { dados: o, erro, recarregar } = useDados(() => get<Linha & { eventos: Evento[]; aberta_por: string }>(`/ocorrencias/${id}`), [id]);
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setNota(''); setMsg(''); }, [id]);
  const podeStatus = usuario.papel === 'TI' || usuario.papel === 'ADMIN';

  async function agir(fn: () => Promise<unknown>, limpar = true) {
    setOcupado(true); setMsg('');
    try { await fn(); if (limpar) setNota(''); recarregar(); aoMudar(); }
    catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  if (erro && !o) return <section className="card"><Falha mensagem={erro} onTentar={recarregar} /></section>;
  if (!o) return <section className="card"><Carregando texto="Carregando ocorrência…" /></section>;
  const aberta = o.status !== 'RESOLVIDA' && o.status !== 'CANCELADA';
  return (
    <section className="card detalhe-oc" aria-live="polite">
      <div className="linha"><h2>{o.equipamento}</h2><SeloStatus status={o.status} /><SeloSeveridade severidade={o.severidade} /></div>
      <p className="muted small">{o.central} · Baia {o.baia} · aberta por {o.aberta_por} em {fmtData(o.aberta_em, tz)}{aberta ? ` (há ${fmtDur(desde(o.aberta_em))})` : o.resolvida_em ? ` · encerrada em ${fmtData(o.resolvida_em, tz)}` : ''}</p>
      <ol className="linha-tempo">
        {o.eventos.map((ev) => (
          <li key={ev.id} className={ev.para_status === 'RESOLVIDA' ? 'fim' : ''}>
            <div className="small muted num">{fmtData(ev.em, tz)} · {ev.usuario}</div>
            <div><b>{ev.tipo === 'NOTA' ? 'Anotação' : ev.tipo === 'CONFIRMADA' ? 'Defeito continua' : ev.para_status ? STATUS_ROTULO[ev.para_status] : ev.tipo}</b>{ev.nota ? ` — ${ev.nota}` : ''}</div>
          </li>))}
      </ol>
      {msg && <Aviso tom="erro" onFechar={() => setMsg('')}>{msg}</Aviso>}
      <label className="campo sep">Anotação {podeStatus ? '(vai junto com a mudança de situação)' : ''}
        <textarea value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: troquei o cabo, aguardando teste" /></label>
      <div className="linha sep0">
        <button className="btn" disabled={ocupado || nota.trim().length < 2} onClick={() => agir(() => post(`/ocorrencias/${id}/notas`, { nota: nota.trim() }))}>Só anotar</button>
        {podeStatus && PROXIMOS[o.status]!.map((s) => (
          <button key={s} className={'btn' + (s === 'RESOLVIDA' ? ' prim' : '')} disabled={ocupado || (s === 'CANCELADA' && nota.trim().length < 3)} title={s === 'CANCELADA' ? 'Escreva o motivo na anotação' : undefined}
            onClick={() => agir(() => post(`/ocorrencias/${id}/status`, { status: s, nota: nota.trim() }))}>{ACAO[s]}</button>))}
      </div>
      {!podeStatus && <p className="muted small">Só a TI altera a situação. Você pode deixar anotações.</p>}
    </section>
  );
}
