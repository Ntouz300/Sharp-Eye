import { CLASSIFICATION as C } from './config';

export type Label =
  | 'book'
  | 'forced'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'miss';

/** Ordre d'affichage dans le résumé. */
export const LABEL_ORDER: Label[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'forced',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

export const LABEL_INFO: Record<Label, { name: string; plural: string; symbol: string }> = {
  book: { name: 'Théorique', plural: 'Théoriques', symbol: 'livre' },
  forced: { name: 'Forcé', plural: 'Forcés', symbol: '→' },
  brilliant: { name: 'Brillant', plural: 'Brillants', symbol: '!!' },
  great: { name: 'Coup clé', plural: 'Coups clés', symbol: '!' },
  best: { name: 'Meilleur', plural: 'Meilleurs', symbol: '★' },
  excellent: { name: 'Excellent', plural: 'Excellents', symbol: '👍' },
  good: { name: 'Bon', plural: 'Bons', symbol: '✓' },
  inaccuracy: { name: 'Imprécision', plural: 'Imprécisions', symbol: '?!' },
  mistake: { name: 'Erreur', plural: 'Erreurs', symbol: '?' },
  blunder: { name: 'Gaffe', plural: 'Gaffes', symbol: '??' },
  miss: { name: 'Occasion manquée', plural: 'Occasions manquées', symbol: '✕' },
};

/** Étiquettes à revoir (boutons « Erreur suivante / précédente »). */
export const REVIEW_LABELS: Label[] = ['inaccuracy', 'mistake', 'blunder', 'miss'];

export interface ClassifyInput {
  /** Coup présent dans le livre d'ouvertures (et toute la partie jusqu'ici aussi). */
  isBook: boolean;
  /** Nombre de coups légaux dans la position avant le coup. */
  legalMoves: number;
  playedIsBest: boolean;
  /** Win % du joueur avant le coup (meilleure suite du moteur). */
  winBefore: number;
  /** Win % du joueur après le coup joué. */
  winAfter: number;
  /** Win % du joueur avec le 2e meilleur coup du moteur, s'il existe. */
  winSecondBest?: number;
  /**
   * Référence « déjà gagné d'avance » pour Brillant : Win % et évaluation (cp, mat → ±10000) du joueur
   * avant le coup adverse précédent, c'est-à-dire avant que l'occasion n'apparaisse.
   */
  refWin: number;
  refCp: number;
  /** Perte matérielle nette offerte par le coup (en pions). */
  sacrifice: number;
  isRecapture: boolean;
  /** Étiquette du coup adverse précédent. */
  previousLabel?: Label;
  /** Win % du joueur avant le coup adverse précédent. */
  winBeforePrevious?: number;
}

/** Applique les règles de la section 3 dans l'ordre ; la première qui s'applique gagne. */
export function classifyMove(x: ClassifyInput): Label {
  const loss = Math.max(0, x.winBefore - x.winAfter);
  if (x.isBook) return 'book';
  if (x.legalMoves === 1) return 'forced';

  if (
    (x.playedIsBest || loss <= C.brilliantMaxLoss) &&
    x.sacrifice >= C.sacrificeMinLoss &&
    !x.isRecapture &&
    x.refWin < C.brilliantMaxWinBefore &&
    x.refCp < C.brilliantMaxCpBefore &&
    x.winAfter >= C.brilliantMinWinAfter
  ) {
    return 'brilliant';
  }

  if (x.playedIsBest && x.winSecondBest !== undefined && x.winBefore - x.winSecondBest >= C.onlyMoveGap) {
    return 'great';
  }
  if (x.playedIsBest) return 'best';

  if (
    (x.previousLabel === 'mistake' || x.previousLabel === 'blunder') &&
    loss >= C.missedMinGain &&
    x.winBeforePrevious !== undefined &&
    x.winAfter >= x.winBeforePrevious - C.missedMaxBelowBaseline
  ) {
    return 'miss';
  }

  if (x.winBefore > C.totallyWinning && x.winAfter > C.totallyWinning) return 'excellent';
  if (loss <= C.excellentMax) return 'excellent';
  if (loss <= C.goodMax) return 'good';
  if (loss <= C.inaccuracyMax) return 'inaccuracy';
  if (loss <= C.mistakeMax) return 'mistake';
  return 'blunder';
}
