import { createContext, use, useCallback, useEffect, useState } from 'react';
import type { Sessao } from './api';

export const SessaoCtx = createContext<Sessao>(null as unknown as Sessao);
export const useSessao = () => use(SessaoCtx);

export function useRota(): string {
  const [r, setR] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => setR(location.hash.slice(1) || '/');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}

/**
 * Carrega dados e permite recarregar; mostra erro em vez de ficar em branco.
 * `carregando` fica verdadeiro também nas recargas, enquanto os dados anteriores continuam na tela.
 */
export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregar()
      .then((d) => { if (vivo) { setDados(d); setErro(''); } })
      .catch((e: Error) => { if (vivo) setErro(e.message || 'Não foi possível conectar ao servidor.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const recarregar = useCallback(() => setN((x) => x + 1), []);
  return { dados, erro, carregando, recarregar };
}
