import { useId, type ReactNode } from 'react';
import { Icone } from './Icone';

/** Cabeçalho de toda tela: título, explicação curta e ações à direita. */
export function CabecalhoPagina({ titulo, children, acoes }: { titulo: ReactNode; children?: ReactNode; acoes?: ReactNode }) {
  return (
    <header className="cab">
      <div className="cab-txt">
        <h1>{titulo}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      {acoes && <div className="cab-acoes">{acoes}</div>}
    </header>
  );
}

/** Bloco com título próprio. O título rotula a região para leitores de tela. */
export function Secao({ titulo, idTitulo, descricao, acoes, className, children }: {
  titulo: ReactNode; idTitulo?: string; descricao?: ReactNode; acoes?: ReactNode; className?: string; children: ReactNode;
}) {
  const gerado = useId();
  const id = idTitulo ?? gerado;
  return (
    <section className={'card secao' + (className ? ' ' + className : '')} aria-labelledby={id}>
      <div className="secao-cab">
        <div className="secao-titulo">
          <h2 id={id}>{titulo}</h2>
          {descricao && <p className="muted small">{descricao}</p>}
        </div>
        {acoes && <div className="secao-acoes">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function Voltar({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="voltar" href={href}>
      <Icone nome="esquerda" tamanho={16} />
      {children}
    </a>
  );
}
