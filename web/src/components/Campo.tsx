import { useId, type ReactNode } from 'react';

/** Propriedades que o campo entrega ao controle para ligar rótulo, dica e erro. */
export interface PropsControle {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/**
 * Campo de formulário: rótulo visível, dica opcional e erro junto do campo.
 * O controle é passado como função para receber o id e as ligações de acessibilidade.
 */
export function Campo({ rotulo, dica, erro, className, children }: {
  rotulo: ReactNode; dica?: ReactNode; erro?: string | null; className?: string;
  children: (p: PropsControle) => ReactNode;
}) {
  const id = useId();
  const idDica = dica ? id + '-dica' : undefined;
  const idErro = erro ? id + '-erro' : undefined;
  const descrito = [idDica, idErro].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'campo' + (erro ? ' com-erro' : '') + (className ? ' ' + className : '')}>
      <label htmlFor={id}>{rotulo}</label>
      {children({ id, 'aria-describedby': descrito, ...(erro ? { 'aria-invalid': true as const } : {}) })}
      {dica && <small id={idDica} className="campo-dica">{dica}</small>}
      {erro && <small id={idErro} className="campo-erro">{erro}</small>}
    </div>
  );
}
