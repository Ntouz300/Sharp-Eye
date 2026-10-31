import type { Score } from '../analysis/winPercent';

export interface EngineLine {
  multipv: number;
  depth: number;
  /** Score du point de vue des blancs. */
  score: Score;
  /** Ligne principale en notation UCI. */
  pv: string[];
}

export interface PositionEval {
  fen: string;
  depth: number;
  /** Lignes triées de la meilleure à la moins bonne. */
  lines: EngineLine[];
  /** Temps de calcul réellement passé sur la position (ms), absent pour les positions terminales. */
  timeMs?: number;
}

export interface Engine {
  /** Évalue une position à profondeur fixe. Lève AbortError si le signal est annulé. */
  analyze(fen: string, depth: number, multiPv: number, signal?: AbortSignal): Promise<PositionEval>;
  /** Arrête le calcul en cours. */
  stop(): void;
  readonly name: string;
}
