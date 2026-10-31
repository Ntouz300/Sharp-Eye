import type { GameAnalysis } from '../../analysis/analyzeGame';
import type { ParsedGame } from '../../pgn/types';
import { db, type StoredPuzzle } from '../../storage/db';
import { cutLine, isAmbiguous, playerMoves } from './challenge';

const DAY = 24 * 3600 * 1000;
/** Intervalles de révision après chaque réussite : 1, 3, 7 puis 21 jours. Un échec ramène au lendemain. */
export const INTERVALS = [1, 3, 7, 21];

export function themeOf(explanation: string | undefined, phase: string): string {
  const t = explanation ?? '';
  if (/\bmat\b|mat en/.test(t)) return 'Mats';
  if (/fourchette/.test(t)) return 'Fourchettes';
  if (/clou/.test(t)) return 'Clouages';
  if (/enfilade/.test(t)) return 'Enfilades';
  if (/découv/.test(t)) return 'Découvertes';
  if (/promotion|promeut|va à dame/.test(t)) return 'Promotions';
  if (/sans protection|en prise|gain d|gagne|perds|matériel/.test(t)) return 'Pièces en prise';
  if (phase === 'endgame') return 'Finales';
  return 'Tactique';
}

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Crée les puzzles d'une partie analysée : chaque gaffe, erreur et occasion manquée des joueurs suivis. */
export function puzzlesFromGame(gameId: string, game: ParsedGame, analysis: GameAnalysis, players: ('w' | 'b')[]): StoredPuzzle[] {
  const out: StoredPuzzle[] = [];
  analysis.moves.forEach((a, i) => {
    const m = game.moves[i];
    if (!players.includes(m.color)) return;
    if (a.label !== 'mistake' && a.label !== 'blunder' && a.label !== 'miss') return;
    const solution = analysis.evals?.[i]?.lines[0]?.pv ?? (a.bestUci ? [a.bestUci] : []);
    if (!solution.length) return;
    const loss = Math.max(0, a.winBefore - a.winAfter);
    const cut = cutLine(m.fenBefore, solution);
    out.push({
      version: 2,
      line: cut.line,
      goal: cut.goal,
      gain: cut.gain,
      // Premier coup non unique (le 2e choix du moteur gagne aussi) : pas un bon défi.
      ambiguous: isAmbiguous(analysis.evals?.[i], m.color),
      id: `${gameId}|${i}`,
      gameId,
      moveIndex: i,
      fen: m.fenBefore,
      solution: solution.slice(0, 8),
      played: m.uci,
      label: a.label,
      theme: themeOf(a.explanation, a.phase),
      explanation: a.explanation,
      // Plus la perte est grande, plus la solution est en général évidente.
      rating: Math.round(Math.max(800, Math.min(2400, 2100 - loss * 12))),
      due: startOfDay(Date.now()),
      stage: 0,
      attempts: 0,
      successes: 0,
      createdAt: Date.now(),
    });
  });
  return out;
}

/** Un puzzle peut être proposé : premier coup unique et combinaison d'au moins 2 coups (ou rallongeable). */
export const playable = (p: StoredPuzzle) => !p.ambiguous && (p.line ? playerMoves(p.line) >= 1 : true);

/**
 * Convertit les anciens puzzles (un seul coup) en défis en plusieurs coups, sans toucher à leur historique
 * (révisions, réussites, échéances). L'ambiguïté du premier coup est relue dans l'analyse enregistrée.
 */
export async function migratePuzzles(): Promise<number> {
  const old = await db.puzzles.filter((p) => p.version !== 2).toArray();
  if (!old.length) return 0;
  const analyses = await db.analyses.where('gameId').anyOf([...new Set(old.map((p) => p.gameId))]).toArray();
  const evalsFor = (gameId: string) => analyses.find((a) => a.gameId === gameId && a.analysis.complete)?.analysis.evals;
  const fresh = old.map((p) => {
    const ev = evalsFor(p.gameId)?.[p.moveIndex];
    const color = p.fen.split(' ')[1] === 'b' ? 'b' : 'w';
    const cut = cutLine(p.fen, p.solution);
    return { ...p, version: 2, line: cut.line, goal: cut.goal, gain: cut.gain, ambiguous: ev ? isAmbiguous(ev, color) : false, theme: p.theme === 'Attaques à la découverte' ? 'Découvertes' : p.theme };
  });
  await db.puzzles.bulkPut(fresh);
  return fresh.length;
}

/** Quels camps appartiennent à l'utilisateur (pseudos des réglages), sinon les deux. */
export function myColors(game: ParsedGame, usernames: string[]): ('w' | 'b')[] {
  const names = usernames.map((u) => u.trim().toLowerCase()).filter(Boolean);
  if (!names.length) return ['w', 'b'];
  const colors: ('w' | 'b')[] = [];
  if (names.includes((game.headers.White ?? '').toLowerCase())) colors.push('w');
  if (names.includes((game.headers.Black ?? '').toLowerCase())) colors.push('b');
  return colors.length ? colors : ['w', 'b'];
}

export async function syncPuzzles(gameId: string, game: ParsedGame, analysis: GameAnalysis, usernames: string[]) {
  const fresh = puzzlesFromGame(gameId, game, analysis, myColors(game, usernames));
  const existing = new Set((await db.puzzles.where('gameId').equals(gameId).primaryKeys()) as string[]);
  await db.puzzles.bulkPut(fresh.filter((p) => !existing.has(p.id)));
}

// ---------- Classement (Glicko simple) ----------

export interface PuzzleProfile {
  rating: number;
  rd: number;
  streak: number;
  lastDay: number;
  solvedToday: number;
}

const DEFAULT_PROFILE: PuzzleProfile = { rating: 1500, rd: 350, streak: 0, lastDay: 0, solvedToday: 0 };

export async function getProfile(): Promise<PuzzleProfile> {
  const v = (await db.kv.get('puzzleProfile'))?.value as PuzzleProfile | undefined;
  return { ...DEFAULT_PROFILE, ...v };
}

/** Mise à jour Glicko-1 pour une partie contre un puzzle (RD du puzzle fixé à 80). */
export function glicko(rating: number, rd: number, opponent: number, score: 0 | 1): { rating: number; rd: number } {
  const q = Math.log(10) / 400;
  const rdOpp = 80;
  const g = 1 / Math.sqrt(1 + (3 * q * q * rdOpp * rdOpp) / (Math.PI * Math.PI));
  const e = 1 / (1 + 10 ** ((-g * (rating - opponent)) / 400));
  const d2 = 1 / (q * q * g * g * e * (1 - e));
  const newRd = Math.sqrt(1 / (1 / (rd * rd) + 1 / d2));
  const newRating = rating + q * newRd * newRd * g * (score - e);
  return { rating: Math.round(newRating), rd: Math.max(50, Math.round(newRd)) };
}

/** Enregistre une tentative : révision espacée, classement et série quotidienne. */
export async function recordAttempt(p: StoredPuzzle, success: boolean, now = Date.now()): Promise<{ puzzle: StoredPuzzle; profile: PuzzleProfile }> {
  const today = startOfDay(now);
  const stage = success ? Math.min(p.stage + 1, INTERVALS.length) : 0;
  const days = success ? INTERVALS[stage - 1] : 1;
  const puzzle: StoredPuzzle = { ...p, stage, due: today + days * DAY, attempts: p.attempts + 1, successes: p.successes + (success ? 1 : 0) };
  const prof = await getProfile();
  const g = glicko(prof.rating, prof.rd, p.rating, success ? 1 : 0);
  let streak = prof.streak;
  if (prof.lastDay !== today) streak = prof.lastDay === today - DAY ? streak + 1 : 1;
  const profile: PuzzleProfile = { ...g, streak, lastDay: today, solvedToday: (prof.lastDay === today ? prof.solvedToday : 0) + (success ? 1 : 0) };
  await db.puzzles.put(puzzle);
  await db.kv.put({ key: 'puzzleProfile', value: profile });
  return { puzzle, profile };
}
