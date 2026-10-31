import { useEffect, useState } from 'react';
import { getEngine } from './stockfish';
import type { PositionEval } from './types';

/** Analyse en direct de la position affichée (mode Explorer, lignes du moteur). */
export function useLiveEngine(fen: string | null, depth: number, multiPv: number): { result: PositionEval | null; loading: boolean } {
  const [result, setResult] = useState<PositionEval | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!fen) {
      setResult(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setResult(null);
    getEngine()
      .analyze(fen, depth, multiPv, ctrl.signal)
      .then((r) => {
        if (!ctrl.signal.aborted) setResult(r);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [fen, depth, multiPv]);
  return { result, loading };
}
