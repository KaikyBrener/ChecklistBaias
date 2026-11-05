import { createContext, useContext, useEffect, useState } from 'react';
import type { Sessao } from './api';

export const SessaoCtx = createContext<Sessao>(null as unknown as Sessao);
export const useSessao = () => useContext(SessaoCtx);

export function useRota(): string {
  const [r, setR] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => setR(location.hash.slice(1) || '/');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}

/** Carrega dados e permite recarregar; mostra erro em vez de ficar em branco. */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    carregar().then((d) => { if (vivo) { setDados(d); setErro(''); } }).catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { dados, erro, recarregar: () => setN((x) => x + 1) };
}
