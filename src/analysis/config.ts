/**
 * Seuils de classification et paramètres d'analyse, centralisés ici (section 3 du cahier des charges).
 * Toutes les valeurs de Win % sont en points de pourcentage (0 à 100).
 */
export const CLASSIFICATION = {
  /** ΔW maximal pour chaque étiquette basée sur la perte de Win %. */
  excellentMax: 2,
  goodMax: 5,
  inaccuracyMax: 10,
  mistakeMax: 20,
  /** Coup clé : le 2e meilleur coup perd au moins ce nombre de points. */
  onlyMoveGap: 10,
  /** Brillant : ΔW maximal toléré quand le coup n'est pas le premier choix. */
  brilliantMaxLoss: 2,
  /** Brillant : W avant le coup doit être strictement inférieur à ce seuil. */
  brilliantMaxWinBefore: 90,
  /** Brillant : W après le coup doit être au moins égal à ce seuil (position non perdante). */
  brilliantMinWinAfter: 45,
  /** Brillant : interdit si l'évaluation avant le coup vaut +5 (500 cp) ou plus pour le joueur. */
  brilliantMaxCpBefore: 500,
  /** Brillant : perte matérielle nette minimale (en pions) pour parler de sacrifice. */
  sacrificeMinLoss: 2,
  /** Occasion manquée : écart minimal entre le meilleur coup et le coup joué. */
  missedMinGain: 15,
  /** Occasion manquée : le joueur ne doit pas finir plus de N points sous sa situation avant l'erreur adverse. */
  missedMaxBelowBaseline: 5,
  /** Position totalement gagnée : un coup qui reste au-dessus de ce seuil n'est pas dégradé. */
  totallyWinning: 97,
} as const;

export const WIN_PERCENT = {
  /** Coefficient de la sigmoïde Win %. */
  k: 0.00368208,
  /** Borne de l'évaluation en centipions avant conversion. */
  cpClamp: 1000,
} as const;

export const MOVE_ACCURACY = { a: 103.1668, b: 0.04354, c: 3.1669 } as const;

export const GAME_ACCURACY = {
  /** Bornes du poids (écart type du Win % sur la fenêtre). */
  minWeight: 0.5,
  maxWeight: 12,
  /** Taille de la fenêtre glissante : nombre de coups / 10, borné entre 2 et 8. */
  minWindow: 2,
  maxWindow: 8,
} as const;

export type ReviewLevel = 'quick' | 'standard' | 'deep';

/**
 * Niveaux de revue. Profondeurs ajustées pour tenir l'objectif « 40 coups en moins de 60 s » en Standard
 * avec le moteur monothread (voir DECISIONS.md, mesures : p14 ≈ 0,2 s, p16 ≈ 0,5 s, p18 ≈ 1 s par position).
 */
export const REVIEW_LEVELS: Record<ReviewLevel, { label: string; depth: number; multiPv: number }> = {
  quick: { label: 'Rapide', depth: 14, multiPv: 2 },
  standard: { label: 'Standard', depth: 16, multiPv: 2 },
  deep: { label: 'Approfondie', depth: 20, multiPv: 3 },
};

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
