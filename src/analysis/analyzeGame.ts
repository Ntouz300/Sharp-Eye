import { Chess } from 'chess.js';
import type { Engine, PositionEval } from '../engine/types';
import type { MoveNode, ParsedGame } from '../pgn/types';
import { gameAccuracy } from './accuracy';
import { classifyMove, type Label } from './classify';
import { REVIEW_LEVELS, type ReviewLevel } from './config';
import { isRecapture, majorsAndMinors, sacrificedMaterial } from './material';
import { lookupBook } from './openings';
import { estimatePerformance } from './performance';
import { moveAccuracy, scoreToCp, winPercentFor, winPercentWhite, type Score } from './winPercent';

export type Phase = 'opening' | 'middlegame' | 'endgame';

export interface MoveAnalysis {
  label: Label;
  accuracy: number;
  /** Win % du joueur avant et après le coup. */
  winBefore: number;
  winAfter: number;
  /** Évaluation après le coup, côté blancs. */
  scoreAfter: Score;
  /** Évaluation avant le coup (meilleure suite), côté blancs. */
  scoreBefore: Score;
  bestUci?: string;
  bestSan?: string;
  /** Ligne principale du moteur depuis la position avant le coup, en SAN. */
  bestLine: string[];
  playedIsBest: boolean;
  phase: Phase;
}

export interface PlayerSummary {
  accuracy: number | null;
  performance: number | null;
  counts: Partial<Record<Label, number>>;
  phases: Partial<Record<Phase, number>>;
  /** Index (0-based) du premier coup hors théorie. */
  leftBookAt?: number;
}

export interface GameAnalysis {
  level: ReviewLevel;
  depth: number;
  engine: string;
  moves: MoveAnalysis[];
  /** Win % côté blancs de chaque position (position initiale incluse). */
  winsWhite: number[];
  /** Évaluation côté blancs de chaque position. */
  scores: Score[];
  opening?: { eco: string; name: string };
  white: PlayerSummary;
  black: PlayerSummary;
  /** Index des trois coups qui ont le plus changé la partie. */
  keyMoments: number[];
  complete: boolean;
}

/** Cache des évaluations (clé FEN + profondeur + MultiPV). */
export interface EvalCache {
  get(key: string): Promise<PositionEval | undefined>;
  set(key: string, value: PositionEval): Promise<void>;
}

export function cacheKey(fen: string, depth: number, multiPv: number): string {
  return `${fen.split(' ').slice(0, 4).join(' ')}|${depth}|${multiPv}`;
}

/** Évaluation d'une position terminale (mat ou pat) sans moteur. */
function terminalEval(fen: string, depth: number): PositionEval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    const whiteMated = chess.turn() === 'w';
    return { fen, depth, lines: [{ multipv: 1, depth, score: { mate: 0, cp: whiteMated ? -1 : 1 }, pv: [] }] };
  }
  if (chess.isStalemate() || chess.isInsufficientMaterial()) {
    return { fen, depth, lines: [{ multipv: 1, depth, score: { cp: 0 }, pv: [] }] };
  }
  return null;
}

/** Win % côté blancs, en tenant compte d'un mat déjà sur l'échiquier. */
export function winWhite(score: Score): number {
  if (score.mate === 0) return (score.cp ?? 0) > 0 ? 100 : 0;
  return winPercentWhite(score);
}

function winFor(score: Score, color: 'w' | 'b'): number {
  if (score.mate === 0) {
    const w = winWhite(score);
    return color === 'w' ? w : 100 - w;
  }
  return winPercentFor(score, color);
}

function uciToSanLine(fen: string, pv: string[], max = 8): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      out.push(chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

function backRankSparse(fen: string): boolean {
  const ranks = fen.split(' ')[0].split('/');
  const count = (rank: string, re: RegExp) => (rank.match(re) ?? []).length;
  return count(ranks[7], /[NBRQK]/g) < 4 || count(ranks[0], /[nbrqk]/g) < 4;
}

/** Phase de chaque coup selon le matériel restant (monotone : ouverture → milieu → finale). */
export function computePhases(moves: MoveNode[]): Phase[] {
  let phase: Phase = 'opening';
  return moves.map((m) => {
    const pieces = majorsAndMinors(m.fenBefore);
    if (pieces <= 6) phase = 'endgame';
    else if (phase === 'opening' && (pieces <= 10 || backRankSparse(m.fenBefore))) phase = 'middlegame';
    return phase;
  });
}

export interface AnalyzeOptions {
  level: ReviewLevel;
  engine: Engine;
  cache?: EvalCache;
  signal?: AbortSignal;
  /** Appelé après chaque position, avec l'analyse partielle. */
  onProgress?: (analysis: GameAnalysis, done: number, total: number) => void;
}

/** Lance la revue complète d'une partie. Les coups sont classés au fur et à mesure. */
export async function analyzeGame(game: ParsedGame, opts: AnalyzeOptions): Promise<GameAnalysis> {
  const { depth, multiPv } = REVIEW_LEVELS[opts.level];
  const fens = [game.startFen, ...game.moves.map((m) => m.fenAfter)];
  const evals: PositionEval[] = [];
  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i];
    let ev = terminalEval(fen, depth);
    if (!ev) {
      const key = cacheKey(fen, depth, multiPv);
      ev = (await opts.cache?.get(key)) ?? null;
      if (!ev) {
        ev = await opts.engine.analyze(fen, depth, multiPv, opts.signal);
        await opts.cache?.set(key, ev);
      }
    }
    evals.push(ev);
    opts.onProgress?.(buildAnalysis(game, evals, opts.level, opts.engine.name), i + 1, fens.length);
  }
  return buildAnalysis(game, evals, opts.level, opts.engine.name);
}

/** Construit l'analyse (classification, précisions, résumé) à partir des évaluations déjà calculées. */
export function buildAnalysis(game: ParsedGame, evals: PositionEval[], level: ReviewLevel, engineName: string): GameAnalysis {
  const { depth } = REVIEW_LEVELS[level];
  const scores = evals.map((e) => e.lines[0]?.score ?? { cp: 0 });
  const winsWhite = scores.map(winWhite);
  const phases = computePhases(game.moves);
  const book = lookupBook(game.startFen, game.moves);
  const moves: MoveAnalysis[] = [];

  for (let i = 0; i < game.moves.length && i + 1 < evals.length; i++) {
    const m = game.moves[i];
    const before = evals[i];
    const after = evals[i + 1];
    const best = before.lines[0];
    const second = before.lines[1];
    const color = m.color;
    const winBefore = winFor(best.score, color);
    const winAfter = winFor(after.lines[0].score, color);
    const playedIsBest = best?.pv[0] === m.uci;
    const legal = new Chess(m.fenBefore).moves().length;
    const prev = i > 0 ? game.moves[i - 1] : undefined;
    const prevCapture = prev ? !!new Chess(prev.fenBefore).get(prev.uci.slice(2, 4) as never) : false;
    // Référence pour « déjà gagné » : la position avant le coup adverse précédent (ou avant ce coup s'il n'y en a pas).
    const refScore = i > 0 ? evals[i - 1].lines[0].score : best.score;
    const refCpWhite = scoreToCp(refScore);
    const label = classifyMove({
      isBook: book.inBook[i],
      legalMoves: legal,
      playedIsBest,
      winBefore,
      winAfter,
      winSecondBest: second ? winFor(second.score, color) : undefined,
      refWin: winFor(refScore, color),
      refCp: color === 'w' ? refCpWhite : -refCpWhite,
      sacrifice: playedIsBest || winBefore - winAfter <= 2 ? sacrificedMaterial(m.fenBefore, m.uci) : 0,
      isRecapture: isRecapture(prev?.uci, prevCapture, m.uci),
      previousLabel: i > 0 ? moves[i - 1]?.label : undefined,
      winBeforePrevious: i > 0 ? winFor(evals[i - 1].lines[0].score, color) : undefined,
    });
    moves.push({
      label,
      accuracy: moveAccuracy(winBefore, winAfter),
      winBefore,
      winAfter,
      scoreBefore: best.score,
      scoreAfter: after.lines[0].score,
      bestUci: best.pv[0],
      bestSan: best.pv[0] ? uciToSanLine(m.fenBefore, best.pv, 1)[0] : undefined,
      bestLine: uciToSanLine(m.fenBefore, best.pv, 8),
      playedIsBest,
      phase: phases[i],
    });
  }

  const colors = game.moves.slice(0, moves.length).map((m) => m.color);
  const accs = moves.map((m) => m.accuracy);
  const summary = (player: 'w' | 'b'): PlayerSummary => {
    const counts: Partial<Record<Label, number>> = {};
    const phaseAcc: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] };
    let leftBookAt: number | undefined;
    moves.forEach((m, i) => {
      if (colors[i] !== player) return;
      counts[m.label] = (counts[m.label] ?? 0) + 1;
      phaseAcc[m.phase].push(m.accuracy);
      if (leftBookAt === undefined && m.label !== 'book') leftBookAt = i;
    });
    const accuracy = gameAccuracy(winsWhite.slice(0, moves.length + 1), accs, colors, player);
    const phasesOut: Partial<Record<Phase, number>> = {};
    for (const p of Object.keys(phaseAcc) as Phase[]) {
      const list = phaseAcc[p];
      if (list.length) phasesOut[p] = list.reduce((a, b) => a + b, 0) / list.length;
    }
    return {
      accuracy,
      performance: accuracy === null ? null : estimatePerformance(accuracy, game.headers.TimeControl),
      counts,
      phases: phasesOut,
      leftBookAt,
    };
  };

  const swings = moves.map((_m, i) => ({ i, d: Math.abs(winsWhite[i + 1] - winsWhite[i]) }));
  const keyMoments = swings
    .filter((s) => s.d >= 10)
    .sort((a, b) => b.d - a.d)
    .slice(0, 3)
    .map((s) => s.i)
    .sort((a, b) => a - b);

  return {
    level,
    depth,
    engine: engineName,
    moves,
    winsWhite,
    scores,
    opening: book.opening,
    white: summary('w'),
    black: summary('b'),
    keyMoments,
    complete: moves.length === game.moves.length,
  };
}
