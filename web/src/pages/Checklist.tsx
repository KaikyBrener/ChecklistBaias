import { useState } from 'react';
import { ErroApi, SEV_ROTULO, fmtData, fmtDur, desde, get, post, put, type Severidade } from '../api';
import { Progresso } from '../charts';
import { useDados, useSessao } from '../ctx';
import { Aviso } from '../components/Aviso';
import { Carregando, Falha, Vazio } from '../components/Estado';
import { Icone, iconeDoTipo, type NomeIcone } from '../components/Icone';
import { CabecalhoPagina, Secao, Voltar } from '../components/Pagina';
import { Segmento } from '../components/Segmento';
import { Selo, SeloSeveridade } from '../components/Selo';

type Resultado = 'OK' | 'DEFEITO' | 'NA';
interface Item {
  id: number; nome: string; tipo: string; resultado: Resultado | null; severidade: Severidade | null; observacao: string;
  ocorrenciaAberta: { id: number; severidade: Severidade; status: string; abertaEm: string; descricao: string } | null;
}
interface Baia { id: number; numero: number; equipamentos: Item[] }
interface Detalhe {
  id: number; central: { id: number; nome: string }; diaOperacional: string; turno: 'DIA' | 'NOITE'; status: 'EM_ANDAMENTO' | 'CONCLUIDO';
  iniciadoPor: string; iniciadoEm: string; concluidoEm: string | null; total: number; respondidos: number;
  baias: Baia[];
}

const ROTULO_RESULTADO: Record<Resultado, string> = { OK: 'Funcionando', DEFEITO: 'Com defeito', NA: 'Não se aplica' };
const turnoTexto = (t: 'DIA' | 'NOITE') => (t === 'DIA' ? 'Dia' : 'Noite');

/** "2026-11-09" → "09/11/2026 (seg.)" (a data operacional não tem hora, então não depende de fuso). */
const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const FMT_SEMANA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' });
function fmtDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${FMT_DATA.format(d)} (${FMT_SEMANA.format(d)})`;
}

export function Checklist({ rota }: { rota: string }) {
  const id = Number(rota.split('/')[2]);
  return Number.isInteger(id) && id > 0 ? <Detalhe key={id} id={id} /> : <Lista />;
}

/* ================= lista: centrais do turno + histórico ================= */

function Lista() {
  const { tz, usuario } = useSessao();
  const { dados: t, erro, recarregar } = useDados(() => get('/turno-atual'), []);
  const { dados: hist, erro: erroHist, recarregar: recarregarHist } = useDados(() => get<any[]>('/checklists?limite=20'), []);
  const [msg, setMsg] = useState('');
  const [iniciando, setIniciando] = useState<number | null>(null);
  const pode = usuario.papel === 'COORDENADOR' || usuario.papel === 'ADMIN';

  async function iniciar(centralId: number) {
    setIniciando(centralId); setMsg('');
    try { const r = await post('/checklists', { central_id: centralId }); location.hash = `#/checklist/${r.id}`; }
    catch (e) { setMsg((e as Error).message); setIniciando(null); }
  }

  if (erro && !t) return <Falha mensagem={erro} onTentar={recarregar} />;
  if (!t) return <Carregando texto="Carregando checklists…" />;
  return (
    <>
      <CabecalhoPagina titulo="Checklist do turno">
        Turno {t.turno === 'DIA' ? 'do dia' : 'da noite'}, <span className="num">{fmtData(t.inicio, tz, 'hora')} às {fmtData(t.fim, tz, 'hora')}</span>. Cada central tem um checklist por turno.
      </CabecalhoPagina>
      {msg && <div className="bloco"><Aviso tom="erro" onFechar={() => setMsg('')}>{msg}</Aviso></div>}

      {t.centrais.length === 0 ? (
        <div className="card bloco"><Vazio icone="predio" titulo="Nenhuma central cadastrada">O administrador cadastra centrais e baias na tela Cadastro.</Vazio></div>
      ) : (
        <div className="centrais-turno bloco">
          {t.centrais.map((c: any) => {
            const k = c.checklist;
            const estado = !k ? 'nao-iniciado' : k.status === 'CONCLUIDO' ? 'concluido' : 'andamento';
            return (
              <section key={c.id} className={'card central-card ' + estado} aria-labelledby={`central-${c.id}`}>
                <div className="central-card-cab">
                  <h2 id={`central-${c.id}`}>{c.nome}</h2>
                  {!k && <Selo>Não iniciado</Selo>}
                  {k?.status === 'EM_ANDAMENTO' && <Selo tom="atencao">Em andamento</Selo>}
                  {k?.status === 'CONCLUIDO' && <Selo tom="ok"><Icone nome="visto" tamanho={13} />Concluído</Selo>}
                </div>
                {k ? (
                  <div className="central-card-prog">
                    <Progresso valor={k.respondidos} total={k.total} rotulo={`Andamento do checklist da ${c.nome}`} />
                    <p className="muted small num">{k.respondidos} de {k.total} equipamentos conferidos{k.status === 'EM_ANDAMENTO' && k.total > k.respondidos ? ` · faltam ${k.total - k.respondidos}` : ''}</p>
                  </div>
                ) : <p className="muted small num">{c.total} equipamentos para conferir.</p>}
                <div className="linha">
                  {!k && pode && (
                    <button type="button" className="btn prim" onClick={() => iniciar(c.id)} disabled={iniciando !== null}>
                      {iniciando === c.id ? <><span className="spinner claro" aria-hidden="true" />Iniciando…</> : 'Iniciar checklist'}
                    </button>
                  )}
                  {!k && !pode && <p className="muted small">Só o coordenador inicia o checklist.</p>}
                  {k && <a className={'btn' + (k.status === 'EM_ANDAMENTO' && pode ? ' prim' : '')} href={`#/checklist/${k.id}`}>{k.status === 'EM_ANDAMENTO' && pode ? 'Continuar' : 'Ver checklist'}</a>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Secao titulo="Últimos checklists">
        {erroHist && !hist ? <Falha mensagem={erroHist} onTentar={recarregarHist} /> : !hist ? <Carregando texto="Carregando histórico…" /> : hist.length === 0 ? (
          <Vazio icone="checklist" titulo="Nenhum checklist feito ainda">Os checklists aparecem aqui, do mais recente para o mais antigo.</Vazio>
        ) : (
          <div className="tabela-wrap"><table>
            <thead><tr><th scope="col">Dia</th><th scope="col">Turno</th><th scope="col">Central</th><th scope="col">Feito por</th><th scope="col">Situação</th></tr></thead>
            <tbody>{hist.map((h) => (
              <tr key={h.id} className="clic" onClick={() => { location.hash = `#/checklist/${h.id}`; }}>
                <td><a href={`#/checklist/${h.id}`} className="num">{fmtDia(h.dia_operacional ?? h.diaOperacional)}</a></td>
                <td>{turnoTexto(h.turno)}</td><td>{h.central ?? h.central_nome}</td>
                <td>{h.iniciado_por ?? h.iniciadoPor}</td>
                <td>{h.status === 'CONCLUIDO' ? <Selo tom="ok">Concluído</Selo> : <Selo tom="atencao">Em andamento</Selo>}</td>
              </tr>))}</tbody></table></div>
        )}
      </Secao>
    </>
  );
}

/* ================= detalhe: conferência baia por baia ================= */

type EstadoBaia = 'feita' | 'defeito' | 'pendente';
function estadoDaBaia(b: Baia): { estado: EstadoBaia; feitos: number } {
  const feitos = b.equipamentos.filter((e) => e.resultado !== null).length;
  const defeito = b.equipamentos.some((e) => e.resultado === 'DEFEITO' || (e.ocorrenciaAberta && e.resultado !== 'OK'));
  return { estado: feitos < b.equipamentos.length ? 'pendente' : defeito ? 'defeito' : 'feita', feitos };
}

/** Rola até o elemento deixando-o logo abaixo da barra fixa do checklist (que, senão, o cobriria). */
function rolarAte(el: HTMLElement) {
  const barra = document.querySelector<HTMLElement>('.checkbar')?.offsetHeight ?? 0;
  const top = el.getBoundingClientRect().top + window.scrollY - barra - 16;
  window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/** Leva até o equipamento e põe o foco no primeiro botão dele (teclado e leitor de tela seguem junto). */
function irPara(equipamentoId: number) {
  const el = document.getElementById(`eq-${equipamentoId}`);
  if (!el) return;
  // primeiro item da baia: mostra também o cabeçalho dela
  rolarAte(el.previousElementSibling?.tagName === 'HEADER' && el.parentElement ? el.parentElement : el);
  el.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
}

function Detalhe({ id }: { id: number }) {
  const { tz, usuario } = useSessao();
  const { dados: c, erro, recarregar } = useDados(() => get<Detalhe>(`/checklists/${id}`), [id]);
  const [aviso, setAviso] = useState('');
  const [anuncio, setAnuncio] = useState('');
  const [destacar, setDestacar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'faltam'>('todos');
  const pode = (usuario.papel === 'COORDENADOR' || usuario.papel === 'ADMIN') && c?.status === 'EM_ANDAMENTO';

  async function salvar(e: Item, corpo: { resultado: Resultado } & Record<string, unknown>) {
    setAviso('');
    try {
      await put(`/checklists/${id}/itens/${e.id}`, corpo);
      setAnuncio(`${e.nome}: ${ROTULO_RESULTADO[corpo.resultado].toLowerCase()}.`);
      recarregar();
    } catch (x) { setAviso((x as Error).message); throw x; }
  }
  async function tudoOk(b: Baia) {
    setAviso('');
    try {
      const r = await post(`/checklists/${id}/baias/${b.id}/tudo-ok`);
      if (r.restantes > 0) setAviso(`${r.restantes} equipamento(s) dessa baia têm defeito aberto e precisam ser conferidos um a um.`);
      setAnuncio(`Baia ${b.numero}: equipamentos marcados como funcionando.`);
      recarregar();
    } catch (x) { setAviso((x as Error).message); }
  }
  async function concluir() {
    setOcupado(true); setAviso('');
    try { await post(`/checklists/${id}/concluir`); location.hash = '#/checklist'; }
    catch (x) {
      if (x instanceof ErroApi && x.status === 409) {
        setDestacar(true);
        setAviso(x.message);
        // o primeiro pendente vem dos dados (não da classe CSS, que só aparece no próximo desenho)
        const prim = c?.baias.flatMap((b) => b.equipamentos).find((e) => e.resultado === null);
        if (prim) requestAnimationFrame(() => irPara(prim.id));
      } else setAviso((x as Error).message);
    } finally { setOcupado(false); }
  }

  if (erro && !c) return <Falha mensagem={erro} onTentar={recarregar} />;
  if (!c) return <Carregando texto="Carregando checklist…" />;

  const faltam = c.total - c.respondidos;
  const emAndamento = c.status === 'EM_ANDAMENTO';
  const estados = new Map(c.baias.map((b) => [b.id, estadoDaBaia(b)]));
  const proximo = c.baias.flatMap((b) => b.equipamentos).find((e) => e.resultado === null);
  const baiasVisiveis = filtro === 'faltam' ? c.baias.filter((b) => estados.get(b.id)!.estado === 'pendente') : c.baias;

  return (
    <>
      <Voltar href="#/checklist">Voltar aos checklists</Voltar>
      <div className="checkbar">
        <div className="checkbar-topo">
          <div className="checkbar-titulo">
            <h1>{c.central.nome} · {turnoTexto(c.turno).toLowerCase()}</h1>
            {emAndamento ? <Selo tom="atencao">Em andamento</Selo> : <Selo tom="ok"><Icone nome="visto" tamanho={13} />Concluído</Selo>}
          </div>
          <div className="checkbar-acoes">
            {pode && proximo && (
              <button type="button" className="btn" onClick={() => { setFiltro('todos'); requestAnimationFrame(() => irPara(proximo.id)); }}>
                <Icone nome="baixo" tamanho={16} />Próximo pendente
              </button>
            )}
            {pode && (
              <button type="button" className="btn prim" onClick={concluir} disabled={ocupado}>
                {ocupado ? <><span className="spinner claro" aria-hidden="true" />Concluindo…</> : 'Concluir checklist'}
              </button>
            )}
          </div>
        </div>
        <div className="checkbar-prog">
          <Progresso valor={c.respondidos} total={c.total} rotulo="Equipamentos conferidos" />
          <span className="checkbar-conta num">{c.respondidos}/{c.total}{faltam > 0 && emAndamento ? ` · faltam ${faltam}` : ''}</span>
        </div>
        <nav className="navbaias" aria-label="Ir para a baia">
          {c.baias.map((b) => {
            const { estado, feitos } = estados.get(b.id)!;
            const rot = estado === 'pendente' ? `faltam ${b.equipamentos.length - feitos}` : estado === 'defeito' ? 'conferida, com defeito' : 'conferida';
            return (
              <button key={b.id} type="button" className={'navbaia ' + estado} aria-label={`Baia ${b.numero}: ${rot}`}
                onClick={() => { const el = document.getElementById(`bloco-${b.id}`); if (el) rolarAte(el); }}>
                {estado === 'feita' && <Icone nome="visto" tamanho={12} />}
                {estado === 'defeito' && <Icone nome="alerta" tamanho={12} />}
                <span className="num">{b.numero}</span>
              </button>
            );
          })}
        </nav>
        {aviso && <Aviso tom="atencao" onFechar={() => setAviso('')}>{aviso}</Aviso>}
        <p className="sr" role="status" aria-live="polite">{anuncio}</p>
      </div>

      <div className="checklist-info">
        <p className="muted small num">
          {fmtDia(c.diaOperacional)} · iniciado por {c.iniciadoPor} às {fmtData(c.iniciadoEm, tz, 'hora')}
          {c.concluidoEm && ` · concluído às ${fmtData(c.concluidoEm, tz, 'hora')}`}
        </p>
        {emAndamento && (
          <Segmento rotulo="Mostrar" valor={filtro} onMudar={setFiltro} opcoes={[{ valor: 'todos', texto: 'Todas as baias' }, { valor: 'faltam', texto: 'Só o que falta' }]} />
        )}
      </div>

      {baiasVisiveis.length === 0 && (
        <div className="card"><Vazio tom="ok" icone="certo" titulo="Todas as baias foram conferidas">{pode ? 'Confira os registros e conclua o checklist.' : 'Nada pendente neste checklist.'}</Vazio></div>
      )}

      {baiasVisiveis.map((b) => {
        const { estado, feitos } = estados.get(b.id)!;
        const livres = b.equipamentos.filter((e) => e.resultado === null && !e.ocorrenciaAberta).length;
        const itens = filtro === 'faltam' ? b.equipamentos.filter((e) => e.resultado === null) : b.equipamentos;
        return (
          <section key={b.id} id={`bloco-${b.id}`} className={'baia-bloco ' + estado} aria-labelledby={`baia-${b.id}`}>
            <header>
              <h2 id={`baia-${b.id}`}>Baia {b.numero}</h2>
              <span className="baia-conta num" aria-label={`${feitos} de ${b.equipamentos.length} conferidos`}>{feitos}/{b.equipamentos.length}</span>
              {estado === 'feita' && <Selo tom="ok"><Icone nome="visto" tamanho={13} />Conferida</Selo>}
              {estado === 'defeito' && <Selo tom="parado"><Icone nome="alerta" tamanho={13} />Com defeito</Selo>}
              <span className="espaco" />
              {pode && livres > 0 && <button type="button" className="btn peq" onClick={() => tudoOk(b)}><Icone nome="visto" tamanho={16} />Tudo funcionando</button>}
            </header>
            {itens.map((e) => (
              <ItemLinha key={e.id} e={e} pode={pode} pendente={destacar && e.resultado === null} salvar={(corpo) => salvar(e, corpo)} />
            ))}
          </section>
        );
      })}
    </>
  );
}

/* ================= um equipamento ================= */

function iconeDoItem(e: Item): { nome: NomeIcone; tom: string; texto: string } {
  if (e.resultado === 'OK') return { nome: 'visto', tom: 'ok', texto: 'Funcionando' };
  if (e.resultado === 'NA') return { nome: 'na', tom: 'neutro', texto: 'Não se aplica' };
  if (e.resultado === 'DEFEITO') return { nome: 'alerta', tom: 'parado', texto: 'Com defeito' };
  return { nome: 'circulo', tom: 'pendente', texto: 'Não conferido' };
}

function ItemLinha({ e, pode, pendente, salvar }: {
  e: Item; pode: boolean; pendente: boolean; salvar: (c: { resultado: Resultado } & Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState(false);
  const [sev, setSev] = useState<Severidade>(e.severidade ?? 'DEGRADADO');
  const [obs, setObs] = useState(e.observacao ?? '');
  const [envio, setEnvio] = useState(false);
  const oc = e.ocorrenciaAberta;
  const marca = iconeDoItem(e);
  const enviar = async (corpo: { resultado: Resultado } & Record<string, unknown>) => {
    setEnvio(true);
    try { await salvar(corpo); setForm(false); } catch { /* aviso mostrado no topo */ } finally { setEnvio(false); }
  };

  return (
    <div className={'item' + (pendente ? ' pendente' : '') + (e.resultado === null ? ' aberto' : '')} id={`eq-${e.id}`} aria-busy={envio}>
      <div className="item-topo">
        <span className={'item-marca ' + marca.tom} title={marca.texto}><Icone nome={marca.nome} tamanho={16} /><span className="sr">{marca.texto}:</span></span>
        <span className="item-tipo" aria-hidden="true"><Icone nome={iconeDoTipo(e.tipo)} tamanho={20} /></span>
        <span className="item-nome">{e.nome}</span>
        {oc && <SeloSeveridade severidade={oc.severidade}>Defeito aberto há {fmtDur(desde(oc.abertaEm))} · {SEV_ROTULO[oc.severidade]}</SeloSeveridade>}
        {e.resultado === 'NA' && <Selo>Não se aplica</Selo>}
        {pode ? (
          <span className="resp" role="group" aria-label={`Resultado de ${e.nome}`}>
            {oc ? (
              <>
                <button type="button" className={'btn' + (e.resultado === 'DEFEITO' ? ' marcado-def' : '')} aria-pressed={e.resultado === 'DEFEITO'} disabled={envio}
                  onClick={() => enviar({ resultado: 'DEFEITO', severidade: oc.severidade })}>Ainda com defeito</button>
                <button type="button" className={'btn' + (e.resultado === 'OK' ? ' marcado-ok' : '')} aria-pressed={e.resultado === 'OK'} disabled={envio}
                  onClick={() => enviar({ resultado: 'OK' })}>Voltou a funcionar</button>
              </>
            ) : (
              <>
                <button type="button" className={'btn' + (e.resultado === 'OK' ? ' marcado-ok' : e.resultado === null ? ' sugerido' : '')} aria-pressed={e.resultado === 'OK'} disabled={envio}
                  onClick={() => { setForm(false); enviar({ resultado: 'OK' }); }}><Icone nome="visto" tamanho={16} />Funcionando</button>
                <button type="button" className={'btn' + (e.resultado === 'DEFEITO' ? ' marcado-def' : '')} disabled={envio} onClick={() => setForm(!form)} aria-expanded={form}
                  aria-controls={`def-${e.id}`}><Icone nome="alerta" tamanho={16} />Com defeito</button>
                <button type="button" className={'btn ghost' + (e.resultado === 'NA' ? ' marcado-na' : '')} aria-pressed={e.resultado === 'NA'} disabled={envio}
                  onClick={() => enviar({ resultado: 'NA' })}>Não tem</button>
              </>
            )}
          </span>
        ) : (
          e.resultado && !oc && e.resultado !== 'NA' && <Selo tom={e.resultado === 'OK' ? 'ok' : 'parado'}>{ROTULO_RESULTADO[e.resultado]}</Selo>
        )}
      </div>
      {oc && <p className="item-oc muted small">“{oc.descricao}” · <a href={`#/ocorrencias/${oc.id}`}>ver ocorrência</a></p>}
      {!oc && e.resultado === 'DEFEITO' && e.observacao && !form && <p className="item-oc muted small">“{e.observacao}”</p>}
      {form && pode && (
        <form id={`def-${e.id}`} className="form-defeito" onSubmit={(ev) => { ev.preventDefault(); enviar({ resultado: 'DEFEITO', severidade: sev, observacao: obs.trim() || undefined }); }}>
          <fieldset className="radios">
            <legend>Como está o equipamento?</legend>
            <label><input type="radio" name={`sev-${e.id}`} checked={sev === 'DEGRADADO'} onChange={() => setSev('DEGRADADO')} />Funciona com problema</label>
            <label><input type="radio" name={`sev-${e.id}`} checked={sev === 'INOPERANTE'} onChange={() => setSev('INOPERANTE')} />Parou de funcionar</label>
          </fieldset>
          <label className="campo">O que aconteceu? (opcional)
            <textarea value={obs} maxLength={500} onChange={(x) => setObs(x.target.value)} placeholder="Ex.: tela piscando, sem áudio no fone esquerdo…" />
            <small className="campo-dica num">{obs.length}/500</small>
          </label>
          <div className="linha">
            <button className="btn prim" disabled={envio}>{envio ? 'Registrando…' : 'Registrar defeito'}</button>
            <button type="button" className="btn" onClick={() => setForm(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
