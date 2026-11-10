import type { ReactNode } from 'react';
import { SEV_ROTULO, STATUS_ROTULO, type Severidade, type Status } from '../api';
import { Icone } from './Icone';

export type TomSelo = 'neutro' | 'ok' | 'atencao' | 'parado' | 'papel';

/** Etiqueta de situação. Use as variantes explícitas abaixo quando o selo representa um dado do domínio. */
export function Selo({ tom = 'neutro', children }: { tom?: TomSelo; children: ReactNode }) {
  return <span className={'selo ' + tom}>{children}</span>;
}

export const tomDoStatus = (s: Status): TomSelo =>
  s === 'RESOLVIDA' ? 'ok' : s === 'CANCELADA' ? 'neutro' : s === 'ABERTA' ? 'parado' : 'atencao';

export const tomDaSeveridade = (s: Severidade): TomSelo => (s === 'INOPERANTE' ? 'parado' : 'atencao');

/** Situação da ocorrência (aberta, em manutenção…). */
export function SeloStatus({ status }: { status: Status }) {
  return <Selo tom={tomDoStatus(status)}>{STATUS_ROTULO[status]}</Selo>;
}

/** Gravidade do defeito, com ícone para não depender só da cor. */
export function SeloSeveridade({ severidade, children }: { severidade: Severidade; children?: ReactNode }) {
  return (
    <Selo tom={tomDaSeveridade(severidade)}>
      <Icone nome={severidade === 'INOPERANTE' ? 'parado' : 'alerta'} tamanho={13} />
      {children ?? SEV_ROTULO[severidade]}
    </Selo>
  );
}
