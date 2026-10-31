export type Color = 'w' | 'b';

/** Case ou flèche colorée issue des annotations [%csl] / [%cal]. */
export interface Shape {
  color: 'G' | 'R' | 'Y' | 'B';
  from: string;
  to?: string;
}

export interface MoveNode {
  san: string;
  uci: string;
  /** Numéro de coup (1, 2, 3…) et camp qui joue. */
  moveNumber: number;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  /** Temps restant à l'horloge après le coup, en secondes ([%clk]). */
  clock?: number;
  /** Évaluation annotée dans le PGN ([%eval]), en centipions côté blancs, ou mat. */
  evalAnnot?: { cp?: number; mate?: number };
  comment?: string;
  /** Évaluations moteur de Sharp Eye ([%se …]) pour la position après ce coup. */
  engineData?: string;
  nags: number[];
  shapes: Shape[];
  /** Variantes qui remplacent ce coup (alternatives jouées depuis fenBefore). */
  variations: MoveNode[][];
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  moves: MoveNode[];
  result: string;
  /** Commentaire placé avant le premier coup. */
  preComment?: string;
  /** Évaluations moteur de Sharp Eye pour la position de départ. */
  startEngineData?: string;
  /** Texte source de la partie, conservé pour la réimporter à l'identique. */
  source?: string;
  /** Avertissements non bloquants (variante illisible ignorée, etc.). */
  warnings: string[];
}

export interface ImportError {
  /** Position de la partie dans le fichier (1 = première). */
  gameIndex: number;
  /** Noms des joueurs, si connus, pour aider à retrouver la partie. */
  label: string;
  /** Coup fautif tel qu'écrit (« 12... Cxe5 »), si l'erreur porte sur un coup. */
  move?: string;
  message: string;
}

export interface ImportResult {
  games: ParsedGame[];
  errors: ImportError[];
}
