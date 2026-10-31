import Dexie, { type Table } from 'dexie';
import type { GameAnalysis } from '../analysis/analyzeGame';
import type { ReviewLevel } from '../analysis/config';
import type { PositionEval } from '../engine/types';

export interface StoredGame {
  id: string;
  /** Texte PGN source de la partie. */
  source: string;
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  date?: string;
  timeControl?: string;
  eco?: string;
  opening?: string;
  link?: string;
  plies: number;
  /** Empreinte des coups (détection des doublons). */
  movesKey: string;
  importedAt: number;
  /** Précisions de la dernière revue terminée. */
  accuracyWhite?: number;
  accuracyBlack?: number;
  analyzedLevel?: ReviewLevel;
  favorite?: 0 | 1;
}

export interface StoredAnalysis {
  /** `${gameId}|${level}` */
  key: string;
  gameId: string;
  analysis: GameAnalysis;
}

export interface StoredEval {
  key: string;
  value: PositionEval;
}

/** Base locale (IndexedDB). Le schéma est versionné : ajouter une version pour chaque migration. */
export class LucideDB extends Dexie {
  games!: Table<StoredGame, string>;
  analyses!: Table<StoredAnalysis, string>;
  evals!: Table<StoredEval, string>;

  constructor() {
    super('echiquier-lucide');
    this.version(1).stores({
      games: 'id, importedAt, movesKey, link, white, black, date',
      analyses: 'key, gameId',
      evals: 'key',
    });
  }
}

export const db = new LucideDB();

export const evalCache = {
  async get(key: string) {
    try {
      return (await db.evals.get(key))?.value;
    } catch {
      return undefined;
    }
  },
  async set(key: string, value: PositionEval) {
    try {
      await db.evals.put({ key, value });
    } catch {
      /* stockage plein ou indisponible : le calcul continue sans cache */
    }
  },
};
