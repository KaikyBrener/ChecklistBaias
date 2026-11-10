import { useState, type ReactNode } from 'react';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone } from '../components/Icone';
import { CabecalhoPagina, Secao } from '../components/Pagina';
import { SeloSeveridade, SeloStatus } from '../components/Selo';
import { Segmento } from '../components/Segmento';
import { STATUS_ROTULO, fmtData, fmtDur, get, desde, type Severidade, type Status } from '../api';
import { BarList, Empilhada, SerieDiaria } from '../charts';
import { useDados, useSessao } from '../ctx';

type EstadoBaia = 'OK' | 'ATENCAO' | 'INOPERANTE';
interface Aberta { id: number; equipamento: string; severidade: Severidade; status: Status; desde: string }
interface Central { id: number; nome: string; abertas: number; inoperantes: number; baiasComProblema: number; baias: Array<{ id: number; numero: number; estado: EstadoBaia; abertas: Aberta[] }> }
interface Painel {
  dias: number; geradoEm: string;
  resumo: { abertasAgora: number; inoperantes: number; novasNoPeriodo: number; resolvidasNoPeriodo: number; mttrHoras: number | null; aderenciaPct: number | null; reincidentes: number };
  mapa: Central[];
  serieDiaria: Array<{ dia: string; abertas: number; resolvidas: number }>;
  porTipo: Array<{ nome: string; total: number }>;
  porTurno: Array<{ nome: string; total: number }>;
  porBaia: Array<{ nome: string; total: number }>;
  reincidentes: Array<{ equipamento: string; local: string; ocorrencias: number }>;
  mttrPorTipo: Array<{ nome: string; horas: number; resolvidas: number }>;
  aderencia: { noPrazo: number; atrasados: number; naoFeitos: number; total: number; prazoMin: number };
  maisAntigas: Array<{ id: number; equipamento: string; local: string; severidade: Severidade; status: Status; horas: number }>;
}

const PERIODOS = [7, 30, 90].map((d) => ({ valor: d, texto: `${d} dias` }));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function Painel() {
  const { tz, usuario, prazoChecklistMin } = useSessao();
  const [dias, setDias] = useState(30);
  const { dados: p, erro, carregando, recarregar } = useDados(() => get<Painel>(`/painel?dias=${dias}`), [dias]);
  const podeCsv = usuario.papel === 'GERENTE' || usuario.papel === 'TI' || usuario.papel === 'ADMIN';

  if (erro && !p) return <Falha mensagem={erro} onTentar={recarregar} />;
  if (!p) return <Carregando texto="Carregando painel…" />;
  const r = p.resumo, a = p.aderencia;

  return (
    <>
      <CabecalhoPagina titulo="Painel" acoes={<>
        <Segmento rotulo="Período" valor={dias} onMudar={setDias} opcoes={PERIODOS} />
        <button type="button" className="btn" onClick={recarregar} disabled={carregando} aria-label="Atualizar painel">
          <Icone nome="atualizar" tamanho={16} className={carregando ? 'girando' : undefined} />Atualizar
        </button>
        {podeCsv && <a className="btn" href={`/api/ocorrencias.csv?dias=${dias}&situacao=todas`} download><Icone nome="baixar" tamanho={16} />Baixar planilha (CSV)</a>}
      </>}>
        <span className="num">Atualizado às {fmtData(p.geradoEm, tz, 'hora')}</span>. Os números do período contam o que foi aberto e resolvido nos últimos {p.dias} dias.
      </CabecalhoPagina>

      {erro && <p className="aviso-recarga" role="alert">Não foi possível atualizar agora ({erro}). Os números abaixo são da última leitura.</p>}

      <div className={'painel' + (carregando ? ' recarregando' : '')} aria-busy={carregando}>
        <AlertasCriticos mapa={p.mapa} />

        <section className="indicadores" aria-label="Indicadores">
          <Indicador rotulo="Defeitos agora" valor={String(r.abertasAgora)} alerta={r.abertasAgora > 0}>equipamentos com defeito</Indicador>
          <Indicador rotulo="Parados" valor={String(r.inoperantes)} alerta={r.inoperantes > 0}>não funcionam</Indicador>
          <Indicador rotulo="Tempo até resolver" valor={fmtDur(r.mttrHoras)}>média no período</Indicador>
          <Indicador rotulo="Checklist no prazo" valor={r.aderenciaPct == null ? '–' : r.aderenciaPct + '%'}>até {prazoChecklistMin} min do início do turno</Indicador>
          <Indicador rotulo="Quebram de novo" valor={String(r.reincidentes)}>equipamentos, mais de 1 vez</Indicador>
        </section>

        <div className="painel-grade">
          <Secao titulo="Mapa das baias agora" idTitulo="h-mapa" className="col-7"
            acoes={<ul className="legenda" aria-label="Legenda do mapa">
              <li><i className="lg-baia" />Tudo certo</li>
              <li><Icone nome="alerta" tamanho={14} className="tom-atencao" />Com problema</li>
              <li><Icone nome="parado" tamanho={14} className="tom-parado" />Parada</li>
            </ul>}>
            <MapaBaias mapa={p.mapa} />
          </Secao>

          <Secao titulo="Defeitos abertos há mais tempo" idTitulo="h-ant" className="col-5">
            {p.maisAntigas.length === 0 ? <Vazio tom="ok" icone="certo" titulo="Nenhum defeito aberto">Todos os equipamentos estão funcionando.</Vazio> : (
              <>
                <ol className="lista-antigas">
                  {p.maisAntigas.map((o) => (
                    <li key={o.id}>
                      <a href={`#/ocorrencias/${o.id}`} className="lista-antigas-link">
                        <span className="lista-antigas-txt">
                          <b>{o.equipamento}</b>
                          <span className="muted small">{o.local} · {STATUS_ROTULO[o.status]}</span>
                        </span>
                        <SeloSeveridade severidade={o.severidade} />
                        <span className="lista-antigas-tempo num" aria-label={`aberto há ${fmtDur(o.horas)}`}>{fmtDur(o.horas)}</span>
                      </a>
                    </li>
                  ))}
                </ol>
                <p className="mais"><a href="#/ocorrencias">Ver todas as ocorrências</a></p>
              </>
            )}
          </Secao>

          <Secao titulo="Defeitos por dia" idTitulo="h-serie" className="col-8">
            <SerieDiaria dados={p.serieDiaria} />
          </Secao>

          <Secao titulo="O checklist está sendo feito?" idTitulo="h-ader" className="col-4"
            descricao="Conta cada turno de cada central, a partir do primeiro checklist dela.">
            <Empilhada partes={[
              { rotulo: `No prazo (até ${a.prazoMin} min)`, valor: a.noPrazo, classe: 'ok' },
              { rotulo: 'Atrasado', valor: a.atrasados, classe: 'at' },
              { rotulo: 'Não feito', valor: a.naoFeitos, classe: 'pa' },
            ]} />
          </Secao>

          <Secao titulo="O que mais quebra" idTitulo="h-tipo" className="col-4">
            <BarList itens={p.porTipo.map((t) => ({ rotulo: t.nome, valor: t.total }))} />
          </Secao>

          <Secao titulo="Baias com mais defeitos" idTitulo="h-baia" className="col-4">
            <BarList itens={p.porBaia.slice(0, 8).map((t) => ({ rotulo: t.nome, valor: t.total }))} />
          </Secao>

          <Secao titulo="Quanto demora para consertar" idTitulo="h-mttr" className="col-4" descricao="Tempo médio entre abrir e resolver.">
            <BarList itens={p.mttrPorTipo.map((t) => ({ rotulo: t.nome, valor: t.horas, dica: plural(t.resolvidas, 'resolvido', 'resolvidos') }))} formato={fmtDur} vazio="Ainda não há ocorrência resolvida no período." />
          </Secao>

          <Secao titulo="Defeitos achados por turno" idTitulo="h-turno" className="col-4">
            <BarList itens={p.porTurno.map((t) => ({ rotulo: t.nome === 'DIA' ? 'Turno do dia' : 'Turno da noite', valor: t.total }))} />
          </Secao>

          <Secao titulo="Quebram de novo" idTitulo="h-reinc" className="col-8" descricao="Equipamentos com mais de uma ocorrência no período.">
            {p.reincidentes.length === 0 ? <p className="graf-vazio">Nenhum equipamento quebrou mais de uma vez no período.</p> : (
              <div className="tabela-wrap"><table>
                <thead><tr><th scope="col">Equipamento</th><th scope="col">Local</th><th scope="col" className="num">Ocorrências</th></tr></thead>
                <tbody>{p.reincidentes.slice(0, 6).map((x) => (
                  <tr key={x.equipamento + x.local}><td>{x.equipamento}</td><td>{x.local}</td><td className="num"><b>{x.ocorrencias}×</b></td></tr>
                ))}</tbody>
              </table></div>
            )}
          </Secao>
        </div>
      </div>
    </>
  );
}

function Indicador({ rotulo, valor, alerta, children }: { rotulo: string; valor: string; alerta?: boolean; children: ReactNode }) {
  return (
    <div className={'indicador' + (alerta ? ' alerta' : '')}>
      <span className="indicador-rotulo">{rotulo}</span>
      <span className="indicador-valor num">{alerta && <Icone nome="alerta" tamanho={20} />}{valor}</span>
      <span className="indicador-nota">{children}</span>
    </div>
  );
}

/** Equipamentos parados agora, do mais antigo para o mais novo. Some quando não há nenhum. */
function AlertasCriticos({ mapa }: { mapa: Central[] }) {
  const parados = mapa
    .flatMap((c) => c.baias.flatMap((b) => b.abertas.filter((o) => o.severidade === 'INOPERANTE').map((o) => ({ ...o, local: `${c.nome} · Baia ${b.numero}` }))))
    .sort((x, y) => x.desde.localeCompare(y.desde));
  if (!parados.length) return null;
  return (
    <section className="alertas" aria-labelledby="h-alertas">
      <div className="alertas-cab">
        <Icone nome="parado" tamanho={20} />
        <h2 id="h-alertas">{plural(parados.length, 'equipamento parado', 'equipamentos parados')} agora</h2>
      </div>
      <ul className="alertas-lista">
        {parados.map((o) => (
          <li key={o.id}>
            <a href={`#/ocorrencias/${o.id}`}><b>{o.equipamento}</b><span>{o.local}</span></a>
            <span className="num">há {fmtDur(desde(o.desde))}</span>
            <SeloStatus status={o.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const ROTULO_ESTADO: Record<EstadoBaia, string> = { OK: 'tudo certo', ATENCAO: 'com problema', INOPERANTE: 'parada' };

function MapaBaias({ mapa }: { mapa: Central[] }) {
  const [sel, setSel] = useState<{ central: number; baia: number } | null>(null);
  if (!mapa.length) return <Vazio icone="predio" titulo="Nenhuma central cadastrada">O administrador cadastra centrais e baias na tela Cadastro.</Vazio>;
  return (
    <div className="mapa">
      {mapa.map((c) => {
        const baiaSel = sel?.central === c.id ? c.baias.find((b) => b.numero === sel.baia) : undefined;
        const idDetalhe = `detalhe-baia-${c.id}`;
        return (
          <div className="central-mapa" key={c.id}>
            <header>
              <h3>{c.nome}</h3>
              <span className="muted small">{c.abertas === 0 ? 'nenhum defeito aberto' : `${plural(c.abertas, 'defeito aberto', 'defeitos abertos')} · ${plural(c.inoperantes, 'parado', 'parados')}`}</span>
            </header>
            <div className="baias">
              {c.baias.map((b) => {
                const marcada = baiaSel?.id === b.id;
                return (
                  <button key={b.id} type="button" className={'baia ' + b.estado} aria-pressed={marcada} aria-controls={idDetalhe}
                    aria-label={`Baia ${b.numero}: ${ROTULO_ESTADO[b.estado]}${b.abertas.length ? `, ${plural(b.abertas.length, 'defeito', 'defeitos')}` : ''}`}
                    onClick={() => setSel(marcada ? null : { central: c.id, baia: b.numero })}>
                    <span className="baia-num">{b.numero}</span>
                    {b.estado === 'INOPERANTE' && <Icone nome="parado" tamanho={14} className="baia-ico" />}
                    {b.estado === 'ATENCAO' && <Icone nome="alerta" tamanho={14} className="baia-ico" />}
                    {b.abertas.length > 1 && <span className="baia-qtd num" aria-hidden="true">{b.abertas.length}</span>}
                  </button>
                );
              })}
            </div>
            <div id={idDetalhe} aria-live="polite">
              {baiaSel && (
                <div className="detalhe-baia">
                  <div className="linha"><b>{c.nome} · Baia {baiaSel.numero}</b><span className="espaco" />
                    <button type="button" className="btn ghost peq" onClick={() => setSel(null)} aria-label="Fechar detalhe da baia"><Icone nome="fechar" tamanho={16} /></button>
                  </div>
                  {baiaSel.abertas.length === 0 ? <p className="muted small">Nenhum defeito aberto. Todos os equipamentos funcionando.</p> : (
                    <ul>{baiaSel.abertas.map((o) => (
                      <li key={o.id}>
                        <a href={`#/ocorrencias/${o.id}`}>{o.equipamento}</a>
                        <SeloSeveridade severidade={o.severidade} />
                        <SeloStatus status={o.status} />
                        <span className="muted small num">há {fmtDur(desde(o.desde))}</span>
                      </li>))}</ul>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
