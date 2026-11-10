import type { ReactNode } from 'react';
import { Icone, type NomeIcone } from './Icone';

/** Estados de tela: carregando, falhou (com nova tentativa) e vazio (com o próximo passo). */

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="estado carregando" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{texto}</span>
    </div>
  );
}

export function Falha({ mensagem, onTentar, titulo = 'Não foi possível carregar' }: { mensagem: string; onTentar?: () => void; titulo?: string }) {
  return (
    <div className="estado falha" role="alert">
      <span className="estado-ico parado" aria-hidden="true"><Icone nome="alerta" tamanho={20} /></span>
      <div className="estado-txt">
        <b>{titulo}</b>
        <p>{mensagem}</p>
      </div>
      {onTentar && <button type="button" className="btn" onClick={onTentar}><Icone nome="atualizar" tamanho={16} />Tentar de novo</button>}
    </div>
  );
}

type TomVazio = 'neutro' | 'ok';
export function Vazio({ titulo, children, icone = 'info', tom = 'neutro', acao }: {
  titulo: string; children?: ReactNode; icone?: NomeIcone; tom?: TomVazio; acao?: ReactNode;
}) {
  return (
    <div className="estado vazio">
      <span className={'estado-ico ' + tom} aria-hidden="true"><Icone nome={icone} tamanho={20} /></span>
      <div className="estado-txt">
        <b>{titulo}</b>
        {children && <p>{children}</p>}
      </div>
      {acao}
    </div>
  );
}
