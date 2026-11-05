import { useState } from 'react';
import { ErroApi, SEV_ROTULO, fmtData, fmtDur, desde, get, post, put, type Severidade } from '../api';
import { Progresso } from '../charts';
import { useDados, useSessao } from '../ctx';
import { Carregando, Voltar } from '../ui';

interface Item {
  id: number; nome: string; tipo: string; resultado: 'OK' | 'DEFEITO' | 'NA' | null; severidade: Severidade | null; observacao: string;
  ocorrenciaAberta: { id: number; severidade: Severidade; status: string; abertaEm: string; descricao: string } | null;
}
interface Detalhe {
  id: number; central: { id: number; nome: string }; diaOperacional: string; turno: 'DIA' | 'NOITE'; status: 'EM_ANDAMENTO' | 'CONCLUIDO';
  iniciadoPor: string; iniciadoEm: string; concluidoEm: string | null; total: number; respondidos: number;
  baias: Array<{ id: number; numero: number; equipamentos: Item[] }>;
}

export function Checklist({ rota }: { rota: string }) {
  const id = Number(rota.split('/')[2]);
  return Number.isInteger(id) && id > 0 ? <Detalhe id={id} /> : <Lista />;
}

function Lista() {
  const { tz, usuario } = useSessao();
  const { dados: t, erro } = useDados(() => get('/turno-atual'), []);
  const { dados: hist } = useDados(() => get<any[]>('/checklists?limite=20'), []);
  const [msg, setMsg] = useState('');
  const pode = usuario.papel === 'COORDENADOR' || usuario.papel === 'ADMIN';
  async function iniciar(centralId: number) {
    try { const r = await post('/checklists', { central_id: centralId }); location.hash = `#/checklist/${r.id}`; }
    catch (e) { setMsg((e as Error).message); }
  }
  if (erro) return <div className="erro" role="alert">{erro}</div>;
  if (!t) return <Carregando />;
  return (
    <>
      <div className="cab"><div>
        <h1>Checklist do turno</h1>
        <p className="muted">Turno {t.turno === 'DIA' ? 'do dia' : 'da noite'}, {fmtData(t.inicio, tz, 'hora')} às {fmtData(t.fim, tz, 'hora')}. Cada central tem um checklist por turno.</p>
      </div></div>
      {msg && <div className="erro" role="alert">{msg}</div>}
      <div className="grade g2">
        {t.centrais.map((c: any) => {
          const k = c.checklist;
          return (
            <section key={c.id} className="card central-card">
              <div className="linha"><h2>{c.nome}</h2><span className="espaco" />
                {!k && <span className="selo">Não iniciado</span>}
                {k?.status === 'EM_ANDAMENTO' && <span className="selo atencao">Em andamento</span>}
                {k?.status === 'CONCLUIDO' && <span className="selo ok">Concluído</span>}
              </div>
              {k && <><Progresso valor={k.respondidos} total={k.total} /><p className="muted small num">{k.respondidos} de {k.total} equipamentos conferidos</p></>}
              {!k && <p className="muted small">{c.total} equipamentos para conferir.</p>}
              <div className="linha">
                {!k && pode && <button className="btn prim" onClick={() => iniciar(c.id)}>Iniciar checklist</button>}
                {k && <a className="btn prim" href={`#/checklist/${k.id}`}>{k.status === 'EM_ANDAMENTO' && pode ? 'Continuar' : 'Ver'}</a>}
              </div>
            </section>
          );
        })}
      </div>
      <section className="card">
        <h2 className="sep0">Últimos checklists</h2>
        {!hist ? null : hist.length === 0 ? <div className="vazio"><span className="vazio-ico" aria-hidden="true">☰</span>Nenhum checklist feito ainda.</div> : (
          <div className="tabela-wrap"><table>
            <thead><tr><th>Dia</th><th>Turno</th><th>Central</th><th>Feito por</th><th>Situação</th></tr></thead>
            <tbody>{hist.map((h) => (
              <tr key={h.id} className="clic" onClick={() => { location.hash = `#/checklist/${h.id}`; }}>
                <td><a href={`#/checklist/${h.id}`}>{h.dia_operacional ?? h.diaOperacional}</a></td>
                <td>{h.turno === 'DIA' ? 'Dia' : 'Noite'}</td><td>{h.central ?? h.central_nome}</td>
                <td>{h.iniciado_por ?? h.iniciadoPor}</td><td><span className={'selo ' + (h.status === 'CONCLUIDO' ? 'ok' : 'atencao')}>{h.status === 'CONCLUIDO' ? 'Concluído' : 'Em andamento'}</span></td>
              </tr>))}</tbody></table></div>
        )}
      </section>
    </>
  );
}

function Detalhe({ id }: { id: number }) {
  const { tz, usuario } = useSessao();
  const { dados: c, erro, recarregar } = useDados(() => get<Detalhe>(`/checklists/${id}`), [id]);
  const [aviso, setAviso] = useState('');
  const [destacar, setDestacar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const pode = (usuario.papel === 'COORDENADOR' || usuario.papel === 'ADMIN') && c?.status === 'EM_ANDAMENTO';

  async function salvar(equipamentoId: number, corpo: object) {
    setAviso('');
    try { await put(`/checklists/${id}/itens/${equipamentoId}`, corpo); recarregar(); }
    catch (e) { setAviso((e as Error).message); throw e; }
  }
  async function tudoOk(baiaId: number) {
    setAviso('');
    try {
      const r = await post(`/checklists/${id}/baias/${baiaId}/tudo-ok`);
      if (r.restantes > 0) setAviso(`${r.restantes} equipamento(s) dessa baia têm defeito aberto e precisam ser conferidos um a um.`);
      recarregar();
    } catch (e) { setAviso((e as Error).message); }
  }
  async function concluir() {
    setOcupado(true); setAviso('');
    try { await post(`/checklists/${id}/concluir`); location.hash = '#/checklist'; }
    catch (e) {
      if (e instanceof ErroApi && e.status === 409) {
        setDestacar(true);
        setAviso(e.message);
        const prim = document.querySelector('.item.pendente');
        prim?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else setAviso((e as Error).message);
    } finally { setOcupado(false); }
  }

  if (erro) return <div className="erro" role="alert">{erro}</div>;
  if (!c) return <Carregando />;
  const faltam = c.total - c.respondidos;
  return (
    <>
      <Voltar href="#/checklist">Voltar aos checklists</Voltar>
      <div className="checkbar">
        <div className="linha">
          <h1>{c.central.nome} · {c.turno === 'DIA' ? 'dia' : 'noite'}</h1>
          <span className={'selo ' + (c.status === 'CONCLUIDO' ? 'ok' : 'atencao')}>{c.status === 'CONCLUIDO' ? 'Concluído' : 'Em andamento'}</span>
          <span className="espaco" />
          {pode && <button className="btn prim" onClick={concluir} disabled={ocupado}>Concluir checklist</button>}
        </div>
        <Progresso valor={c.respondidos} total={c.total} />
        <div className="muted small num">
          {c.respondidos} de {c.total} conferidos{faltam > 0 && c.status === 'EM_ANDAMENTO' ? ` · faltam ${faltam}` : ''} · iniciado por {c.iniciadoPor} às {fmtData(c.iniciadoEm, tz, 'hora')}
          {c.concluidoEm && ` · concluído às ${fmtData(c.concluidoEm, tz, 'hora')}`}
        </div>
        {aviso && <div className="aviso" role="alert">{aviso}</div>}
      </div>
      {c.baias.map((b) => {
        const livres = b.equipamentos.filter((e) => e.resultado === null && !e.ocorrenciaAberta).length;
        const ok = b.equipamentos.filter((e) => e.resultado !== null).length;
        return (
          <section key={b.id} className="baia-bloco" aria-labelledby={`baia-${b.id}`}>
            <header>
              <h3 id={`baia-${b.id}`}>Baia {b.numero}</h3>
              <span className="muted small num">{ok}/{b.equipamentos.length}</span>
              {pode && livres > 0 && <button className="btn peq" onClick={() => tudoOk(b.id)}>Tudo funcionando</button>}
            </header>
            {b.equipamentos.map((e) => (
              <ItemLinha key={e.id} e={e} pode={pode} pendente={destacar && e.resultado === null} salvar={(corpo) => salvar(e.id, corpo)} />
            ))}
          </section>
        );
      })}
    </>
  );
}

function ItemLinha({ e, pode, pendente, salvar }: { e: Item; pode: boolean; pendente: boolean; salvar: (c: object) => Promise<void> }) {
  const [form, setForm] = useState(false);
  const [sev, setSev] = useState<Severidade>(e.severidade ?? 'DEGRADADO');
  const [obs, setObs] = useState(e.observacao ?? '');
  const [envio, setEnvio] = useState(false);
  const oc = e.ocorrenciaAberta;
  const enviar = async (corpo: object) => { setEnvio(true); try { await salvar(corpo); setForm(false); } catch { /* aviso mostrado no topo */ } finally { setEnvio(false); } };

  return (
    <div className={'item' + (pendente ? ' pendente' : '') + (oc || e.resultado === 'DEFEITO' ? ' com-defeito' : e.resultado === 'OK' ? ' feito-ok' : '')} id={`eq-${e.id}`}>
      <div className="item-topo">
        <span className="item-nome">{e.nome}</span>
        {oc && <span className={'selo ' + (oc.severidade === 'INOPERANTE' ? 'parado' : 'atencao')}>Defeito aberto há {fmtDur(desde(oc.abertaEm))} · {SEV_ROTULO[oc.severidade]}</span>}
        {e.resultado === 'NA' && <span className="selo">Não se aplica</span>}
        {pode ? (
          <span className="resp">
            {oc ? (
              <>
                <button className={'btn' + (e.resultado === 'DEFEITO' ? ' marcado-def' : '')} disabled={envio} onClick={() => enviar({ resultado: 'DEFEITO', severidade: oc.severidade })}>Ainda com defeito</button>
                <button className="btn" disabled={envio} onClick={() => enviar({ resultado: 'OK' })}>Voltou a funcionar</button>
              </>
            ) : (
              <>
                <button className={'btn' + (e.resultado === 'OK' ? ' marcado-ok' : '')} disabled={envio} onClick={() => { setForm(false); enviar({ resultado: 'OK' }); }}>Funcionando</button>
                <button className={'btn' + (e.resultado === 'DEFEITO' ? ' marcado-def' : '')} disabled={envio} onClick={() => setForm(!form)} aria-expanded={form}>Com defeito</button>
                <button className="btn ghost peq" disabled={envio} onClick={() => enviar({ resultado: 'NA' })}>Não tem</button>
              </>
            )}
          </span>
        ) : (
          e.resultado && !oc && <span className={'selo ' + (e.resultado === 'OK' ? 'ok' : e.resultado === 'DEFEITO' ? 'parado' : '')}>{e.resultado === 'OK' ? 'Funcionando' : e.resultado === 'DEFEITO' ? 'Com defeito' : 'Não se aplica'}</span>
        )}
      </div>
      {oc && <div className="muted small">“{oc.descricao}” · <a href={`#/ocorrencias/${oc.id}`}>ver ocorrência</a></div>}
      {form && pode && (
        <form className="form-defeito" onSubmit={(ev) => { ev.preventDefault(); enviar({ resultado: 'DEFEITO', severidade: sev, observacao: obs.trim() || undefined }); }}>
          <fieldset className="radios">
            <legend className="small muted">Como está o equipamento?</legend>
            <label><input type="radio" name={`sev-${e.id}`} checked={sev === 'DEGRADADO'} onChange={() => setSev('DEGRADADO')} />Funciona com problema</label>
            <label><input type="radio" name={`sev-${e.id}`} checked={sev === 'INOPERANTE'} onChange={() => setSev('INOPERANTE')} />Parou de funcionar</label>
          </fieldset>
          <label className="campo">O que aconteceu? (opcional)
            <textarea value={obs} maxLength={500} onChange={(x) => setObs(x.target.value)} placeholder="Ex.: tela piscando, sem áudio no fone esquerdo" />
          </label>
          <div className="linha"><button className="btn prim" disabled={envio}>Registrar defeito</button><button type="button" className="btn" onClick={() => setForm(false)}>Cancelar</button></div>
        </form>
      )}
    </div>
  );
}
