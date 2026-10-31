import { MOVE_ACCURACY, WIN_PERCENT } from './config';

/** Évaluation moteur, toujours exprimée du point de vue des blancs. */
export interface Score {
  cp?: number;
  /** Mat en N : positif si les blancs matent, négatif si les noirs matent. 0 = déjà mat. */
  mate?: number;
}

/** Probabilité de gain (0 à 100) pour une évaluation en centipions, du point de vue de celui qui a cet avantage. */
export function winPercentFromCp(cp: number): number {
  const c = Math.max(-WIN_PERCENT.cpClamp, Math.min(WIN_PERCENT.cpClamp, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_PERCENT.k * c)) - 1);
}

/** Win % du point de vue des blancs. Un mat forcé vaut 100 % pour le camp qui mate. */
export function winPercentWhite(score: Score): number {
  if (score.mate !== undefined) {
    if (score.mate > 0) return 100;
    if (score.mate < 0) return 0;
    // mate 0 : le camp au trait est mat ; ce cas est résolu par l'appelant via cp ±100000
    return 50;
  }
  return winPercentFromCp(score.cp ?? 0);
}

/** Win % du point de vue d'une couleur. */
export function winPercentFor(score: Score, color: 'w' | 'b'): number {
  const w = winPercentWhite(score);
  return color === 'w' ? w : 100 - w;
}

/** Précision d'un coup (0 à 100) à partir du Win % avant et après, du point de vue du joueur qui vient de jouer. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = MOVE_ACCURACY.a * Math.exp(-MOVE_ACCURACY.b * (winBefore - winAfter)) - MOVE_ACCURACY.c;
  return Math.max(0, Math.min(100, raw));
}

/** Évaluation en centipions côté blancs utilisable pour l'affichage (mat → ±10000). */
export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) return score.mate > 0 ? 10000 - score.mate : score.mate < 0 ? -10000 - score.mate : 0;
  return score.cp ?? 0;
}

/** Texte d'évaluation pour l'affichage (« +1,4 », « M3 », « -M2 »). */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) {
    if (score.mate === 0) return '#';
    return `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`;
  }
  const v = (score.cp ?? 0) / 100;
  const s = Math.abs(v).toFixed(1).replace('.', ',');
  return v > 0.04 ? `+${s}` : v < -0.04 ? `-${s}` : '0,0';
}
