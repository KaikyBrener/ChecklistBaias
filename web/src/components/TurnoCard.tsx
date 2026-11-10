import { useEffect, useState } from 'react';
import { fmtData } from '../api';
import { Icone } from './Icone';

/** Relógio do turno: só exibição (a lógica do turno vem do servidor). O relógio fica isolado aqui para não redesenhar o app. */
export function TurnoCard({ turno, inicio, fim, tz }: { turno: 'DIA' | 'NOITE'; inicio: string; fim: string; tz: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(t); }, []);
  const ini = new Date(inicio).getTime(), end = new Date(fim).getTime();
  const pct = Math.max(0, Math.min(100, ((agora - ini) / (end - ini)) * 100));
  const falta = Math.max(0, Math.round((end - agora) / 60000));
  const nome = turno === 'DIA' ? 'Dia' : 'Noite';
  const faixa = `${fmtData(inicio, tz, 'hora')}–${fmtData(fim, tz, 'hora')}`;
  return (
    <div className={'turno-chip ' + (turno === 'DIA' ? 'dia' : 'noite')} aria-label={`Turno em andamento: ${nome}, ${faixa}`} role="group">
      <div className="turno-topo"><span>Turno em andamento</span><span className="aovivo"><i aria-hidden="true" />ao vivo</span></div>
      <b className="turno-nome"><Icone nome={turno === 'DIA' ? 'sol' : 'lua'} tamanho={20} />{nome}<span className="sr">,</span> {faixa}</b>
      {/* largura aplicada via CSSOM pelo React: permitido pela CSP (não é atributo de estilo inline no HTML) */}
      <div className="turno-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Andamento do turno"><i style={{ width: pct + '%' }} /></div>
      <small>Termina em {Math.floor(falta / 60)} h {String(falta % 60).padStart(2, '0')} min</small>
    </div>
  );
}
