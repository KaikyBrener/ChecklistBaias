import { useState } from 'react';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone, type NomeIcone } from '../components/Icone';
import { CabecalhoPagina } from '../components/Pagina';
import { SeloSeveridade, SeloStatus } from '../components/Selo';
import { Segmento } from '../components/Segmento';
import { STATUS_ROTULO, fmtData, fmtDur, get, desde, type Severidade, type Status } from '../api';
import { BarList, Empilhada, SerieDiaria } from '../charts';
import { useDados, useSessao } from '../ctx';

interface Painel {
  dias: number; geradoEm: string;
  resumo: { abertasAgora: number; inoperantes: number; novasNoPeriodo: number; resolvidasNoPeriodo: number; mttrHoras: number | null; aderenciaPct: number | null; reincidentes: number };
  mapa: Array<{ id: number; nome: string; abertas: number; inoperantes: number; baiasComProblema: number;
    baias: Array<{ id: number; numero: number; estado: 'OK' | 'ATENCAO' | 'INOPERANTE'; abertas: Array<{ id: number; equipamento: string; severidade: Severidade; status: Status; desde: string }> }> }>;
  serieDiaria: Array<{ dia: string; abertas: number; resolvidas: number }>;
  porTipo: Array<{ nome: string; total: number }>;
  porTurno: Array<{ nome: string; total: number }>;
  porBaia: Array<{ nome: string; total: number }>;
  reincidentes: Array<{ equipamento: string; local: string; ocorrencias: number }>;
  mttrPorTipo: Array<{ nome: string; horas: number; resolvidas: number }>;
  aderencia: { noPrazo: number; atrasados: number; naoFeitos: number; total: number; prazoMin: number };
  maisAntigas: Array<{ id: number; equipamento: string; local: string; severidade: Severidade; status: Status; horas: number }>;
}

function Kpi({ valor, rotulo, titulo, icone, tom, alerta }: { valor: string; rotulo: string; titulo: string; icone: NomeIcone; tom: 'perigo' | 'info' | 'ok' | 'atencao'; alerta?: boolean }) {
  return (
    <div className={'kpi' + (alerta ? ' alerta' : '')}>
      <div className="kpi-topo"><span className="kpi-titulo">{titulo}</span><span className={'kpi-ico ' + tom}><Icone nome={icone} /></span></div>
      <div className="v">{valor}</div>
      <div className="r">{rotulo}</div>
    </div>
  );
}

export function Painel() {
  const { tz, usuario, prazoChecklistMin } = useSessao();
  const [dias, setDias] = useState(30);
  const { dados: p, erro, recarregar } = useDados(() => get<Painel>(`/painel?dias=${dias}`), [dias]);
  const [sel, setSel] = useState<{ central: number; baia: number } | null>(null);
  const podeCsv = usuario.papel === 'GERENTE' || usuario.papel === 'TI' || usuario.papel === 'ADMIN';

  if (erro && !p) return <Falha mensagem={erro} onTentar={recarregar} />;
  if (!p) return <Carregando texto="Carregando painel…" />;
  const r = p.resumo, a = p.aderencia;
  const baiaSel = sel ? p.mapa.find((c) => c.id === sel.central)?.baias.find((b) => b.numero === sel.baia) : undefined;
  const centralSel = sel ? p.mapa.find((c) => c.id === sel.central) : undefined;

  return (
    <>
      <CabecalhoPagina titulo="Painel" acoes={<>
        <Segmento rotulo="Período" valor={dias} onMudar={setDias} opcoes={[7, 30, 90].map((d) => ({ valor: d, texto: `${d} dias` }))} />
        <button className="btn" onClick={recarregar}>Atualizar</button>
        {podeCsv && <a className="btn" href={`/api/ocorrencias.csv?dias=${dias}&situacao=todas`}>Baixar planilha (CSV)</a>}
      </>}>
        Atualizado às {fmtData(p.geradoEm, tz, 'hora')}. Os números do período contam o que foi aberto e resolvido nos últimos {p.dias} dias.
      </CabecalhoPagina>

      <div className="kpis">
        <Kpi titulo="Defeitos agora" icone="ocorrencias" tom="perigo" valor={String(r.abertasAgora)} rotulo="equipamentos com defeito" alerta={r.abertasAgora > 0} />
        <Kpi titulo="Parados" icone="parado" tom="perigo" valor={String(r.inoperantes)} rotulo="não funcionam" alerta={r.inoperantes > 0} />
        <Kpi titulo="Tempo até resolver" icone="relogio" tom="info" valor={fmtDur(r.mttrHoras)} rotulo="média no período" />
        <Kpi titulo="Checklist no prazo" icone="certo" tom="ok" valor={r.aderenciaPct == null ? '–' : r.aderenciaPct + '%'} rotulo={`até ${prazoChecklistMin} min do início do turno`} />
        <Kpi titulo="Quebram de novo" icone="repetir" tom="atencao" valor={String(r.reincidentes)} rotulo="equipamentos, mais de 1 vez" />
      </div>

      <div className="grade g2">
        <section className="card" aria-labelledby="h-mapa">
          <h2 id="h-mapa">Mapa das baias agora</h2>
          <div className="legenda">
            <span><i className="lg-ok" />Tudo certo</span><span><i className="lg-at" />Com problema (!)</span><span><i className="lg-pa" />Parada (✕)</span>
          </div>
          {p.mapa.map((c) => (
            <div className="central-mapa" key={c.id}>
              <header><h3>{c.nome}</h3><span className="muted small">{c.abertas === 0 ? 'nenhum defeito aberto' : `${c.abertas} defeito${c.abertas > 1 ? 's' : ''} aberto${c.abertas > 1 ? 's' : ''} · ${c.inoperantes} parado${c.inoperantes === 1 ? '' : 's'}`}</span></header>
              <div className="baias">
                {c.baias.map((b) => (
                  <button key={b.id} className={'baia ' + b.estado} aria-pressed={sel?.central === c.id && sel.baia === b.numero}
                    aria-label={`Baia ${b.numero}: ${b.estado === 'OK' ? 'tudo certo' : b.estado === 'ATENCAO' ? 'com problema' : 'parada'}`}
                    onClick={() => setSel(sel?.central === c.id && sel.baia === b.numero ? null : { central: c.id, baia: b.numero })}>
                    {b.numero}{b.estado === 'INOPERANTE' && <small aria-hidden>✕</small>}{b.estado === 'ATENCAO' && <small aria-hidden>!</small>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {baiaSel && centralSel && (
            <div className="detalhe-baia">
              <b>{centralSel.nome} · Baia {baiaSel.numero}</b>
              {baiaSel.abertas.length === 0 ? <p className="muted small">Nenhum defeito aberto.</p> : (
                <ul>{baiaSel.abertas.map((o) => (
                  <li key={o.id} className="linha">
                    <span>{o.equipamento}</span>
                    <SeloSeveridade severidade={o.severidade} />
                    <SeloStatus status={o.status} />
                    <span className="muted small">há {fmtDur(desde(o.desde))}</span>
                    <a href={`#/ocorrencias/${o.id}`}>Ver</a>
                  </li>))}</ul>
              )}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="h-ant">
          <h2 id="h-ant">Defeitos abertos há mais tempo</h2>
          {p.maisAntigas.length === 0 ? <Vazio tom="ok" icone="certo" titulo="Nenhum defeito aberto">Todos os equipamentos estão funcionando.</Vazio> : (
            <><div className="tabela-wrap"><table>
              <thead><tr><th>Equipamento</th><th>Local</th><th>Situação</th><th>Aberto há</th></tr></thead>
              <tbody>{p.maisAntigas.map((o) => (
                <tr key={o.id} className="clic" onClick={() => { location.hash = `#/ocorrencias/${o.id}`; }}>
                  <td><a href={`#/ocorrencias/${o.id}`}>{o.equipamento}</a></td>
                  <td>{o.local}</td>
                  <td><SeloSeveridade severidade={o.severidade} /> <span className="small muted">{STATUS_ROTULO[o.status]}</span></td>
                  <td className="num">{fmtDur(o.horas)}</td>
                </tr>))}</tbody></table></div><p className="mais"><a href="#/ocorrencias">Ver todas as ocorrências</a></p></>
          )}
        </section>

        <section className="card graf" aria-labelledby="h-serie">
          <h2 id="h-serie">Defeitos por dia</h2>
          <SerieDiaria dados={p.serieDiaria} />
        </section>

        <section className="card" aria-labelledby="h-ader">
          <h2 id="h-ader">O checklist está sendo feito?</h2>
          <Empilhada partes={[
            { rotulo: `No prazo (até ${a.prazoMin} min)`, valor: a.noPrazo, classe: 'ok' },
            { rotulo: 'Atrasado', valor: a.atrasados, classe: 'at' },
            { rotulo: 'Não feito', valor: a.naoFeitos, classe: 'pa' },
          ]} />
          <p className="muted small">Conta cada turno de cada central, a partir do primeiro checklist dela.</p>
        </section>

        <section className="card" aria-labelledby="h-tipo">
          <h2 id="h-tipo">O que mais quebra</h2>
          <BarList itens={p.porTipo.map((t) => ({ rotulo: t.nome, valor: t.total }))} formato={(v) => String(v)} />
        </section>

        <section className="card" aria-labelledby="h-baia">
          <h2 id="h-baia">Baias com mais defeitos</h2>
          <BarList itens={p.porBaia.slice(0, 8).map((t) => ({ rotulo: t.nome, valor: t.total }))} />
        </section>

        <section className="card" aria-labelledby="h-mttr">
          <h2 id="h-mttr">Quanto demora para consertar</h2>
          <BarList itens={p.mttrPorTipo.map((t) => ({ rotulo: t.nome, valor: t.horas, dica: `${t.resolvidas} resolvido${t.resolvidas > 1 ? 's' : ''}` }))} formato={fmtDur} vazio="Ainda não há ocorrência resolvida no período." />
          <p className="muted small">Tempo médio entre abrir e resolver.</p>
        </section>

        <section className="card" aria-labelledby="h-turno">
          <h2 id="h-turno">Defeitos achados por turno</h2>
          <BarList itens={p.porTurno.map((t) => ({ rotulo: t.nome === 'DIA' ? 'Turno do dia' : 'Turno da noite', valor: t.total }))} />
          <h2 id="h-reinc" className="sep">Quebram de novo</h2>
          {p.reincidentes.length === 0 ? <p className="muted small">Nenhum equipamento quebrou mais de uma vez no período.</p> : (
            <ul className="small">{p.reincidentes.slice(0, 6).map((x, i) => <li key={i}>{x.equipamento} · {x.local} — <b>{x.ocorrencias}×</b></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
