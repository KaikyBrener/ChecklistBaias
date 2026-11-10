import { useState } from 'react';

/** Gráficos em SVG puro: a CSP do servidor proíbe estilo inline, e assim não há biblioteca de gráficos para manter. */

interface Dica { x: number; y: number; texto: string }
function BalaoDica({ d }: { d: Dica | null }) {
  if (!d) return null;
  return <div className="dica" role="status" style={{ left: Math.min(d.x + 12, window.innerWidth - 250), top: d.y + 14 }}>{d.texto}</div>;
}

export function BarList({ itens, formato = (v) => String(v), vazio = 'Sem dados no período.' }: {
  itens: Array<{ rotulo: string; valor: number; dica?: string }>;
  formato?: (v: number) => string; vazio?: string;
}) {
  const [dica, setDica] = useState<Dica | null>(null);
  if (!itens.length || itens.every((i) => i.valor === 0)) return <p className="graf-vazio">{vazio}</p>;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const L = 132, R = 56, W = 460, H = 28, trilho = W - L - R;
  return (
    <div className="graf">
      <svg viewBox={`0 0 ${W} ${itens.length * H}`} role="img" aria-label={itens.map((i) => `${i.rotulo}: ${formato(i.valor)}`).join('; ')}>
        {itens.map((it, i) => {
          const w = Math.max(it.valor > 0 ? 3 : 0, (it.valor / max) * trilho);
          const y = i * H;
          return (
            <g key={it.rotulo} onMouseMove={(e) => it.dica && setDica({ x: e.clientX, y: e.clientY, texto: it.dica })} onMouseLeave={() => setDica(null)}>
              <rect className="alvo" x={0} y={y} width={W} height={H} />
              <text x={0} y={y + 18}>{it.rotulo.length > 21 ? it.rotulo.slice(0, 20) + '…' : it.rotulo}</text>
              <rect className="barra" x={L} y={y + 6} width={w} height={H - 12} rx={3} />
              <text className="rot-forte num" x={L + w + 6} y={y + 18}>{formato(it.valor)}</text>
            </g>
          );
        })}
      </svg>
      <BalaoDica d={dica} />
    </div>
  );
}

export function SerieDiaria({ dados, tz }: { dados: Array<{ dia: string; abertas: number; resolvidas: number }>; tz?: string }) {
  const [dica, setDica] = useState<Dica | null>(null);
  void tz;
  if (!dados.length) return <p className="graf-vazio">Sem dados no período.</p>;
  const W = 560, H = 230, ml = 30, mr = 8, mt = 10, mb = 26;
  const max = Math.max(4, ...dados.flatMap((d) => [d.abertas, d.resolvidas]));
  const topo = Math.ceil(max / 2) * 2;
  const passo = (W - ml - mr) / dados.length;
  const bw = Math.max(2, Math.min(14, passo / 2 - 3));
  const y = (v: number) => mt + (1 - v / topo) * (H - mt - mb);
  const ticks = [0, topo / 2, topo];
  const cada = Math.ceil(dados.length / 10);
  const rot = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return (
    <div className="graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ocorrências abertas e resolvidas por dia">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'eixo' : 'grade-l'} x1={ml} x2={W - mr} y1={y(t)} y2={y(t)} />
            <text x={ml - 6} y={y(t) + 4} textAnchor="end" className="num">{t}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const x0 = ml + i * passo + passo / 2;
          const h = (v: number) => (v > 0 ? Math.max(3, H - mb - y(v)) : 0);
          return (
            <g key={d.dia} className="col" tabIndex={0}
              onMouseMove={(e) => setDica({ x: e.clientX, y: e.clientY, texto: `${rot(d.dia)} · abertas ${d.abertas} · resolvidas ${d.resolvidas}` })}
              onMouseLeave={() => setDica(null)}>
              <rect className="alvo" x={x0 - passo / 2} y={mt} width={passo} height={H - mt - mb} />
              <rect className="sa" x={x0 - bw - 1} y={H - mb - h(d.abertas)} width={bw} height={h(d.abertas)} rx={2} />
              <rect className="sb" x={x0 + 1} y={H - mb - h(d.resolvidas)} width={bw} height={h(d.resolvidas)} rx={2} />
              {i % cada === 0 && <text x={x0} y={H - 8} textAnchor="middle" className="num">{rot(d.dia)}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legenda"><span><i className="lg-a" />Abertas no dia</span><span><i className="lg-b" />Resolvidas no dia</span></div>
      <details>
        <summary className="small muted">Ver como tabela</summary>
        <div className="tabela-wrap"><table><thead><tr><th>Dia</th><th>Abertas</th><th>Resolvidas</th></tr></thead>
          <tbody>{dados.map((d) => <tr key={d.dia}><td>{rot(d.dia)}</td><td className="num">{d.abertas}</td><td className="num">{d.resolvidas}</td></tr>)}</tbody></table></div>
      </details>
      <BalaoDica d={dica} />
    </div>
  );
}

export function Empilhada({ partes }: { partes: Array<{ rotulo: string; valor: number; classe: 'ok' | 'at' | 'pa' }> }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return <p className="graf-vazio">Ainda não há turnos para medir.</p>;
  const W = 460, H = 22;
  let x = 0;
  return (
    <div className="graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join('; ')}>
        {partes.map((p) => {
          const w = (p.valor / total) * W;
          const el = w > 0 ? <rect key={p.rotulo} className={p.classe} x={x} y={0} width={Math.max(0, w - 2)} height={H} rx={3} /> : null;
          x += w;
          return el;
        })}
      </svg>
      <div className="legenda">
        {partes.map((p) => <span key={p.rotulo}><i className={`lg-${p.classe}`} />{p.rotulo}: <b className="num">{p.valor}</b> ({Math.round((p.valor / total) * 100)}%)</span>)}
      </div>
    </div>
  );
}

export function Progresso({ valor, total }: { valor: number; total: number }) {
  const pct = total ? (valor / total) * 100 : 0;
  return (
    <div className="progresso" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={valor}>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none"><rect className="fill" x="0" y="0" width={pct} height="10" /></svg>
    </div>
  );
}
