import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';

export type TomAviso = 'erro' | 'atencao' | 'sucesso' | 'info';

const ICONE: Record<TomAviso, NomeIcone> = { erro: 'alerta', atencao: 'alerta', sucesso: 'certo', info: 'info' };

/**
 * Mensagem em linha. Erro e atenção interrompem o leitor de tela (alert);
 * sucesso e informação são anunciados sem interromper (status).
 */
export function Aviso({ tom, children, onFechar }: { tom: TomAviso; children: ReactNode; onFechar?: () => void }) {
  const urgente = tom === 'erro' || tom === 'atencao';
  return (
    <div className={'aviso-msg ' + tom} role={urgente ? 'alert' : 'status'}>
      <Icone nome={ICONE[tom]} tamanho={18} />
      <div className="aviso-txt">{children}</div>
      {onFechar && (
        <button type="button" className="aviso-fechar" onClick={onFechar} aria-label="Fechar aviso"><Icone nome="fechar" tamanho={16} /></button>
      )}
    </div>
  );
}
