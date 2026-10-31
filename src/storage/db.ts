import Dexie, { type Table } from 'dexie';
import type { GameAnalysis } from '../analysis/analyzeGame';
import type { ReviewLevel } from '../analysis/config';
import type { PositionEval } from '../engine/types';

export type GameOrigin = 'chesscom' | 'lichess' | 'pgn' | 'position';

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
  /** 12 premiers demi-coups en SAN, séparés par des espaces (répertoire d'ouvertures). */
  firstMoves?: string;
  termination?: string;
  /** Empreinte des coups (détection des doublons). */
  movesKey: string;
  importedAt: number;
  /** Précisions de la dernière revue terminée. */
  accuracyWhite?: number;
  accuracyBlack?: number;
  analyzedLevel?: ReviewLevel;
  favorite?: 0 | 1;
  /** Provenance : compte chess.com synchronisé, Lichess, fichier PGN ou position (image ou éditeur). */
  origin?: GameOrigin;
  /** Variante que le moteur ou chess.js ne gèrent pas (Chess960…) : affichée mais pas analysée. */
  unanalyzable?: boolean;
  /** Ouverte au moins une fois dans la revue (sinon « Nouvelle »). */
  opened?: boolean;
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

export interface StoredPuzzle {
  /** `${gameId}|${ply}` */
  id: string;
  gameId: string;
  /** Index du coup dans la partie (0 = premier coup). */
  moveIndex: number;
  fen: string;
  /** Meilleure suite du moteur (UCI), le premier coup est la solution. */
  solution: string[];
  /** Coup réellement joué (UCI). */
  played: string;
  /** Étiquette du coup joué ; « bank » pour un défi de la banque intégrée. */
  label: 'mistake' | 'blunder' | 'miss' | 'bank';
  theme: string;
  explanation?: string;
  rating: number;
  /** Prochaine révision (ms depuis 1970). */
  due: number;
  /** Étape de révision : 0 = nouveau ou raté, puis 1 à 4 (1, 3, 7, 21 jours). */
  stage: number;
  attempts: number;
  successes: number;
  createdAt: number;
  /** Format des défis en plusieurs coups (2). Absent sur les anciens puzzles, convertis à l'ouverture. */
  version?: number;
  /** Combinaison complète (UCI), terminée par un coup du joueur. */
  line?: string[];
  goal?: 'mate' | 'material' | 'decisive';
  gain?: number;
  /** Premier coup non unique : gardé pour l'historique, mais plus proposé. */
  ambiguous?: boolean;
}

export interface KeyValue {
  key: string;
  value: unknown;
}

/** Base locale (IndexedDB). Le schéma est versionné : ajouter une version pour chaque migration. */
export class SharpEyeDB extends Dexie {
  games!: Table<StoredGame, string>;
  analyses!: Table<StoredAnalysis, string>;
  evals!: Table<StoredEval, string>;
  puzzles!: Table<StoredPuzzle, string>;
  kv!: Table<KeyValue, string>;

  constructor() {
    super('sharp-eye');
    this.version(1).stores({
      games: 'id, importedAt, movesKey, link, white, black, date',
      analyses: 'key, gameId',
      evals: 'key',
    });
    // v2 : puzzles personnels et valeurs diverses (classement, séries).
    this.version(2).stores({
      puzzles: 'id, gameId, due, theme, stage',
      kv: 'key',
    });
  }
}

export const db = new SharpEyeDB();

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
