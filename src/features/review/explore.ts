import { Chess } from 'chess.js';
import { useEffect, useState } from 'react';
import { winWhite } from '../../analysis/analyzeGame';
import { classifyMove, type Label } from '../../analysis/classify';
import { scoreToCp, type Score } from '../../analysis/winPercent';
import { getEngine } from '../../engine/stockfish';
import type { PositionEval } from '../../engine/types';

/** Profondeur des coups essayés : assez pour classer un coup, assez rapide pour rester fluide (< 1 s). */
export const EXPLORE_DEPTH = 14;

const winFor = (s: Score, color: 'w' | 'b') => (color === 'w' ? winWhite(s) : 100 - winWhite(s));

/**
 * Classement d'un coup essayé, avec les mêmes règles que les coups de la partie
 * (sans livre d'ouvertures ni sacrifice : l'exploration ne garde pas l'historique).
 */
export function judgeTried(fenBefore: string, uci: string, before: PositionEval, after: PositionEval): Label {
  const color = new Chess(fenBefore).turn();
  const best = before.lines[0];
  const winBefore = winFor(best.score, color);
  const cp = scoreToCp(best.score) * (color === 'w' ? 1 : -1);
  return classifyMove({
    isBook: false,
    legalMoves: new Chess(fenBefore).moves().length,
    playedIsBest: best.pv[0] === uci,
    winBefore,
    winAfter: winFor(after.lines[0]?.score ?? best.score, color),
    winSecondBest: before.lines[1] ? winFor(before.lines[1].score, color) : undefined,
    refWin: winBefore,
    refCp: cp,
    sacrifice: 0,
    isRecapture: false,
  });
}

/** Évaluations des positions explorées, calculées une à une et gardées en mémoire (jamais enregistrées). */
export function useExploreEvals(fens: string[]): Record<string, PositionEval> {
  const [evals, setEvals] = useState<Record<string, PositionEval>>({});
  const key = fens.join('|');
  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    void (async () => {
      for (const fen of fens) {
        if (evals[fen]) continue;
        const c = new Chess(fen);
        const ev: PositionEval = c.isCheckmate()
          ? { fen, depth: 0, lines: [{ multipv: 1, depth: 0, score: { mate: 0, cp: c.turn() === 'w' ? -1 : 1 }, pv: [] }] }
          : c.isDraw() || c.isStalemate()
            ? { fen, depth: 0, lines: [{ multipv: 1, depth: 0, score: { cp: 0 }, pv: [] }] }
            : await getEngine().analyze(fen, EXPLORE_DEPTH, 2, ctrl.signal).catch(() => null as unknown as PositionEval);
        if (!live || !ev) return;
        setEvals((e) => ({ ...e, [fen]: ev }));
      }
    })();
    return () => {
      live = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return evals;
}
