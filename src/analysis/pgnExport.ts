import type { PositionEval } from '../engine/types';
import type { ParsedGame } from '../pgn/types';
import { buildAnalysis, type GameAnalysis } from './analyzeGame';
import { LABEL_INFO, type Label } from './classify';
import { REVIEW_LEVELS, type ReviewLevel } from './config';
import type { Score } from './winPercent';

/**
 * Export PGN annoté. Chaque commentaire porte, en plus du texte lisible, une commande [%se …] qui contient
 * les lignes du moteur de la position : un PGN exporté puis réimporté redonne exactement la même revue,
 * sans relancer le moteur.
 */

const NAG: Partial<Record<Label, number>> = { brilliant: 3, great: 1, inaccuracy: 6, mistake: 2, blunder: 4, miss: 2 };

function encodeScore(s: Score): string {
  if (s.mate !== undefined) return s.mate === 0 ? `m0${(s.cp ?? 0) > 0 ? '+' : '-'}` : `m${s.mate}`;
  return `c${s.cp ?? 0}`;
}

function decodeScore(t: string): Score {
  if (t === 'm0+') return { mate: 0, cp: 1 };
  if (t === 'm0-') return { mate: 0, cp: -1 };
  if (t.startsWith('m')) return { mate: Number(t.slice(1)) };
  return { cp: Number(t.slice(1)) };
}

/** `profondeur;score:coup.coup.coup;score:coup…` (pas de crochet ni d'accolade, compatible PGN). */
export function encodeEval(e: PositionEval): string {
  return [e.depth, ...e.lines.map((l) => `${encodeScore(l.score)}:${l.pv.slice(0, 8).join('.')}`)].join(';');
}

export function decodeEval(fen: string, data: string): PositionEval | null {
  const [depth, ...lines] = data.split(';');
  if (!lines.length || Number.isNaN(Number(depth))) return null;
  return {
    fen,
    depth: Number(depth),
    lines: lines.map((l, i) => {
      const [score, pv] = l.split(':');
      return { multipv: i + 1, depth: Number(depth), score: decodeScore(score), pv: pv ? pv.split('.').filter(Boolean) : [] };
    }),
  };
}

function pgnEval(s: Score): string {
  if (s.mate !== undefined) return s.mate === 0 ? '' : `#${s.mate}`;
  return ((s.cp ?? 0) / 100).toFixed(2);
}

function clock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

const clean = (t: string) => t.replace(/[{}]/g, '');

export function exportAnnotatedPgn(game: ParsedGame, analysis: GameAnalysis, evals: PositionEval[]): string {
  const headers: Record<string, string> = { ...game.headers, Annotator: 'Sharp Eye', SharpEyeLevel: analysis.level };
  if (!headers.Result) headers.Result = game.result;
  const tags = Object.entries(headers)
    .map(([k, v]) => `[${k} "${v.replace(/["\\]/g, '\\$&')}"]`)
    .join('\n');

  const parts: string[] = [];
  const startData = evals[0] ? ` [%se ${encodeEval(evals[0])}]` : '';
  const pre = [game.preComment, analysis.opening ? `${analysis.opening.eco} ${analysis.opening.name}` : ''].filter(Boolean).join(' · ');
  if (pre || startData) parts.push(`{${startData} ${clean(pre)}}`);

  game.moves.forEach((m, i) => {
    const a = analysis.moves[i];
    const num = m.color === 'w' ? `${m.moveNumber}.` : i === 0 ? `${m.moveNumber}...` : '';
    let token = `${num}${num ? ' ' : ''}${m.san}`;
    const nag = a ? NAG[a.label] : undefined;
    if (nag) token += ` $${nag}`;
    const cmds: string[] = [];
    if (a) {
      const e = pgnEval(a.scoreAfter);
      if (e) cmds.push(`[%eval ${e}]`);
    }
    if (m.clock !== undefined) cmds.push(`[%clk ${clock(m.clock)}]`);
    if (evals[i + 1]) cmds.push(`[%se ${encodeEval(evals[i + 1])}]`);
    const text: string[] = [];
    if (a) {
      text.push(`${LABEL_INFO[a.label].name}.`);
      if (a.explanation) text.push(a.explanation);
      if (!a.playedIsBest && a.bestSan && !['book', 'forced'].includes(a.label)) text.push(`Meilleur : ${a.bestSan}.`);
    }
    if (m.comment) text.push(m.comment);
    parts.push(`${token} {${cmds.join(' ')} ${clean(text.join(' '))}}`);
  });
  parts.push(game.result);

  // Lignes de 80 caractères au plus.
  const lines: string[] = [];
  let line = '';
  for (const word of parts.join(' ').split(' ')) {
    if (line && line.length + word.length + 1 > 80) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return `${tags}\n\n${lines.join('\n')}\n`;
}

/** Recompose la revue d'un PGN exporté par Sharp Eye, si toutes les positions portent leurs évaluations. */
export function restoreAnalysis(game: ParsedGame, engineName = 'Stockfish 18 (WASM)'): { analysis: GameAnalysis; evals: PositionEval[] } | null {
  if (!game.startEngineData || game.moves.some((m) => !m.engineData)) return null;
  const evals: PositionEval[] = [];
  const first = decodeEval(game.startFen, game.startEngineData);
  if (!first) return null;
  evals.push(first);
  for (const m of game.moves) {
    const e = decodeEval(m.fenAfter, m.engineData!);
    if (!e) return null;
    evals.push(e);
  }
  const level = (game.headers.SharpEyeLevel as ReviewLevel) in REVIEW_LEVELS ? (game.headers.SharpEyeLevel as ReviewLevel) : 'standard';
  return { analysis: buildAnalysis(game, evals, level, engineName), evals };
}
