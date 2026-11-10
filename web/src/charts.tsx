import { useCallback, useRef, type FocusEvent, type MouseEvent } from 'react';

/**
 * Gráficos em SVG puro: a CSP do servidor proíbe atributo de estilo inline, e assim não há biblioteca
 * de gráficos para manter. Cores vêm das classes do CSS (tokens), nunca do código.
 */

/* ---------- dica (tooltip) ----------
   A posição muda a cada movimento do mouse; por isso fica num ref e é aplicada direto no elemento,
   sem estado do React (o gráfico não redesenha enquanto o mouse anda). Estilo via CSSOM é permitido pela CSP. */
function useDica() {
  const ref = useRef<HTMLDivElement>(null);
  const posicionar = (el: HTMLDivElement, x: number, y: number) => {
    const largura = el.offsetWidth || 200;
    el.style.left = Math.max(8, Math.min(x + 12, window.innerWidth - largura - 8)) + 'px';
    el.style.top = y + 14 + 'px';
  };
  const noMouse = useCallback((texto: string | undefined) => (e: MouseEvent) => {
    const el = ref.current;
    if (!el || !texto) return;
    if (el.textContent !== texto) el.textContent = texto;
    el.hidden = false;
    posicionar(el, e.clientX, e.clientY);
  }, []);
  const noFoco = useCallback((texto: string | undefined) => (e: FocusEvent<Element>) => {
    const el = ref.current;
    if (!el || !texto) return;
    el.textContent = texto;
    el.hidden = false;
    const r = e.currentTarget.getBoundingClientRect();
    posicionar(el, r.left + r.width / 2, r.top);
  }, []);
  const esconder = useCallback(() => { if (ref.current) ref.current.hidden = true; }, []);
  const balao = <div ref={ref} className="dica" hidden aria-hidden="true" />;
  return { balao, noMouse, noFoco, esconder };
}

const fmtPadrao = (v: number) => String(v);

/* ---------- barras horizontais ---------- */
export function BarList({ itens, formato = fmtPadrao, vazio = 'Sem dados no período.' }: {
  itens: Array<{ rotulo: string; valor: number; dica?: string }>;
  formato?: (v: number) => string; vazio?: string;
}) {
  const { balao, noMouse, esconder } = useDica();
  if (!itens.length || itens.every((i) => i.valor === 0)) return <p className="graf-vazio">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  // Texto em HTML (tamanho real, quebra com reticências); só a barra é SVG, esticada na largura da coluna.
  return (
    <div className="graf">
      <ul className="barras">
        {itens.map((it) => {
          const pct = it.valor > 0 ? Math.max(1.5, (it.valor / max) * 100) : 0;
          return (
            <li key={it.rotulo} onMouseMove={noMouse(it.dica)} onMouseLeave={esconder}>
              <span className="barras-rot" title={it.rotulo}>{it.rotulo}</span>
              <svg className="barras-trilho" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                <rect className="trilho" x="0" y="0" width="100" height="10" rx="1" />
                <rect className="barra" x="0" y="0" width={pct} height="10" rx="1" />
              </svg>
              <span className="barras-val num">{formato(it.valor)}{it.dica && <span className="sr"> ({it.dica})</span>}</span>
            </li>
          );
        })}
      </ul>
      {balao}
    </div>
  );
}

/* ---------- colunas por dia (abertas × resolvidas) ---------- */
const rotDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function SerieDiaria({ dados }: { dados: Array<{ dia: string; abertas: number; resolvidas: number }> }) {
  const { balao, noMouse, noFoco, esconder } = useDica();
  if (!dados.length) return <p className="graf-vazio">Sem dados no período.</p>;
  const W = 640, H = 230, ml = 30, mr = 8, mt = 10, mb = 26;
  const max = Math.max(4, ...dados.flatMap((d) => [d.abertas, d.resolvidas]));
  const topo = Math.ceil(max / 2) * 2;
  const passo = (W - ml - mr) / dados.length;
  const bw = Math.max(2, Math.min(14, passo / 2 - 3));
  const y = (v: number) => mt + (1 - v / topo) * (H - mt - mb);
  const ticks = [0, topo / 2, topo];
  const cada = Math.ceil(dados.length / 10);
  let totA = 0, totR = 0;
  for (const d of dados) { totA += d.abertas; totR += d.resolvidas; }
  return (
    <div className="graf">
      <svg className="serie" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Ocorrências abertas e resolvidas por dia">
        {ticks.map((t) => (
          <g key={t} aria-hidden="true">
            <line className={t === 0 ? 'eixo' : 'grade-l'} x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" className="num">{t}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const x0 = ml + i * passo + passo / 2;
          const h = (v: number) => (v > 0 ? Math.max(3, H - mb - y(v)) : 0);
          const texto = `${rotDia(d.dia)}: ${d.abertas} aberta${d.abertas === 1 ? '' : 's'}, ${d.resolvidas} resolvida${d.resolvidas === 1 ? '' : 's'}`;
          return (
            <g key={d.dia} className="col" tabIndex={0} role="img" aria-label={texto}
              onMouseMove={noMouse(texto)} onMouseLeave={esconder} onFocus={noFoco(texto)} onBlur={esconder}>
              <rect className="alvo" x={x0 - passo / 2} y={mt} width={passo} height={H - mt - mb} />
              <rect className="sa" x={x0 - bw - 1} y={H - mb - h(d.abertas)} width={bw} height={h(d.abertas)} rx={2} />
              <rect className="sb" x={x0 + 1} y={H - mb - h(d.resolvidas)} width={bw} height={h(d.resolvidas)} rx={2} />
              {i % cada === 0 && <text x={x0} y={H - 8} textAnchor="middle" className="num" aria-hidden="true">{rotDia(d.dia)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legenda">
        <span><i className="lg-a" />Abertas no dia · <b className="num">{totA}</b> no período</span>
        <span><i className="lg-b" />Resolvidas no dia · <b className="num">{totR}</b> no período</span>
      </div>
      <details className="como-tabela">
        <summary>Ver como tabela</summary>
        <div className="tabela-wrap"><table>
          <thead><tr><th scope="col">Dia</th><th scope="col" className="num">Abertas</th><th scope="col" className="num">Resolvidas</th></tr></thead>
          <tbody>{dados.map((d) => <tr key={d.dia}><td>{rotDia(d.dia)}</td><td className="num">{d.abertas}</td><td className="num">{d.resolvidas}</td></tr>)}</tbody>
        </table></div>
      </details>
      {balao}
    </div>
  );
}

/* ---------- barra empilhada (proporção) ---------- */
export function Empilhada({ partes }: { partes: Array<{ rotulo: string; valor: number; classe: 'ok' | 'at' | 'pa' }> }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return <p className="graf-vazio">Ainda não há turnos para medir.</p>;
  const W = 460, H = 20;
  let x = 0;
  return (
    <div className="graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join('; ')}>
        {partes.map((p) => {
          const w = (p.valor / total) * W;
          const el = w > 0 ? <rect key={p.rotulo} className={p.classe} x={x} y={0} width={Math.max(0, w - 2)} height={H} rx={2} /> : null;
          x += w;
          return el;
        })}
      </svg>
      <ul className="legenda legenda-lista">
        {partes.map((p) => (
          <li key={p.rotulo}><i className={`lg-${p.classe}`} />{p.rotulo}<b className="num">{p.valor}</b><span className="muted num">{Math.round((p.valor / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- barra de progresso ---------- */
export function Progresso({ valor, total, rotulo }: { valor: number; total: number; rotulo?: string }) {
  const pct = total ? (valor / total) * 100 : 0;
  return (
    <div className={'progresso' + (total > 0 && valor >= total ? ' completo' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor}
      aria-label={rotulo} aria-valuetext={`${valor} de ${total}`}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect className="fill" x="0" y="0" width={pct} height="10" /></svg>
    </div>
  );
}
