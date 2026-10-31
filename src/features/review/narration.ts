import type { MoveAnalysis } from '../../analysis/analyzeGame';
import { LABEL_INFO } from '../../analysis/classify';
import type { MoveNode } from '../../pgn/types';
import { spokenSan } from '../../ui/speech';

/** Phrase lue pour un coup : le coup, son classement et, pour un coup à corriger, l'explication. */
export function narrationText(m: MoveNode, a: MoveAnalysis | undefined): string {
  const parts = [`${m.color === 'w' ? m.moveNumber + '.' : ''} ${spokenSan(m.san)}`];
  if (a) {
    parts.push(LABEL_INFO[a.label].name);
    if (a.explanation && !['best', 'book', 'forced'].includes(a.label)) parts.push(a.explanation);
  }
  return parts.join('. ');
}
