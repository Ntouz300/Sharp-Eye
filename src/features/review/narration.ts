import type { MoveAnalysis } from '../../analysis/analyzeGame';
import { LABEL_INFO, REVIEW_LABELS, type Label } from '../../analysis/classify';
import type { MoveNode } from '../../pgn/types';
import { spokenSan } from '../../ui/speech';

/** Coups expliqués à l'oral : ceux à revoir, et les coups remarquables (raison courte). */
const SPOKEN_REASON: Label[] = [...REVIEW_LABELS, 'brilliant', 'great', 'excellent'];

/**
 * Phrase lue pour un coup, sans son numéro : « [coup joué]. [classement]. [raison courte] »,
 * par exemple « Cavalier f3. Imprécision. Mieux valait d4, qui prend le centre. »
 */
export function narrationText(m: MoveNode, a: MoveAnalysis | undefined, sayMove = true, opening?: string): string {
  const parts: string[] = [];
  // Nouvelle variante d'ouverture atteinte : son nom d'abord, « Caro-Kann : attaque Hillbilly ».
  if (opening) parts.push(opening.replace(' : ', ', '));
  if (sayMove) parts.push(spokenSan(m.san));
  if (a) {
    parts.push(LABEL_INFO[a.label].name);
    const reason = a.spokenExplanation ?? a.explanation;
    if (reason && SPOKEN_REASON.includes(a.label)) parts.push(reason.replace(/\.$/, ''));
  }
  return parts.join('. ') + '.';
}
