/** Grupo de botões em que só um fica ativo (ex.: período do painel). */
export function Segmento<T extends string | number>({ rotulo, opcoes, valor, onMudar }: {
  rotulo: string; opcoes: ReadonlyArray<{ valor: T; texto: string }>; valor: T; onMudar: (v: T) => void;
}) {
  return (
    <div className="segmento" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={String(o.valor)} type="button" aria-pressed={valor === o.valor} onClick={() => onMudar(o.valor)}>{o.texto}</button>
      ))}
    </div>
  );
}
