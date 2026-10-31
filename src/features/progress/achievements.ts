import type { StoredPuzzle } from '../../storage/db';
import { mean, type GameStat } from '../stats/stats';

// ---------- Défi du jour ----------

export function dayKey(t = Date.now()): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Puzzle du jour : choisi de façon stable pour la journée parmi les plus difficiles de l'utilisateur. */
export function dailyPuzzle(puzzles: StoredPuzzle[], day = dayKey()): StoredPuzzle | undefined {
  if (!puzzles.length) return undefined;
  const pool = [...puzzles].sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id)).slice(0, Math.max(10, Math.ceil(puzzles.length / 2)));
  return pool[hash(day) % pool.length];
}

// ---------- Badges ----------

export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
  /** Avancement de 0 à 1 pour les badges pas encore obtenus. */
  progress: number;
}

export interface BadgeInput {
  stats: GameStat[];
  puzzles: StoredPuzzle[];
  puzzleRating: number;
  streak: number;
  dailyDone: number;
}

export function badges({ stats, puzzles, puzzleRating, streak, dailyDone }: BadgeInput): Badge[] {
  const analyzed = stats.filter((s) => s.accuracy !== undefined);
  const best = Math.max(0, ...analyzed.map((s) => s.accuracy!));
  const brilliants = analyzed.reduce((a, s) => a + (s.counts?.brilliant ?? 0), 0);
  const greats = analyzed.reduce((a, s) => a + (s.counts?.great ?? 0), 0);
  const clean = analyzed.filter((s) => !(s.counts?.blunder ?? 0) && (s.analysis?.moves.length ?? 0) >= 50).length;
  const solved = puzzles.reduce((a, p) => a + p.successes, 0);
  const mastered = puzzles.filter((p) => p.stage >= 4).length;
  const wins = stats.filter((s) => s.score === 1).length;
  const b = (id: string, name: string, description: string, value: number, goal: number): Badge => ({ id, name, description, earned: value >= goal, progress: Math.min(1, value / goal) });
  return [
    b('first-review', 'Premier regard', 'Analyser une de tes parties.', analyzed.length, 1),
    b('ten-reviews', 'Œil exercé', 'Analyser 10 de tes parties.', analyzed.length, 10),
    b('fifty-reviews', 'Archiviste', 'Analyser 50 de tes parties.', analyzed.length, 50),
    b('accuracy-90', 'Précision chirurgicale', 'Atteindre 90 % de précision dans une partie.', best, 90),
    b('brilliant', 'Éclair de génie', 'Jouer un coup brillant.', brilliants, 1),
    b('great-5', 'Coups clés', 'Trouver 5 coups clés.', greats, 5),
    b('clean', 'Sans faute', 'Finir une partie d’au moins 25 coups sans gaffe.', clean, 1),
    b('wins-10', 'Dix victoires', 'Gagner 10 parties de ta bibliothèque.', wins, 10),
    b('puzzles-10', 'Apprenti tacticien', 'Résoudre 10 puzzles.', solved, 10),
    b('puzzles-100', 'Tacticien', 'Résoudre 100 puzzles.', solved, 100),
    b('mastered', 'Leçon retenue', 'Réussir un puzzle à chacune de ses 4 révisions.', mastered, 1),
    b('streak-7', 'Une semaine', 'S’entraîner 7 jours de suite.', streak, 7),
    b('rating-1800', 'Œil de lynx', 'Atteindre 1800 au classement puzzles.', puzzleRating, 1800),
    b('daily-10', 'Fidèle au rendez-vous', 'Réussir 10 défis du jour.', dailyDone, 10),
  ];
}

// ---------- Bilan du mois ----------

export function monthKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export interface MonthReport {
  month: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  accuracy: number | null;
  previousAccuracy: number | null;
  blundersPerGame: number | null;
  bestGame?: GameStat;
  topOpening?: { moves: string; games: number };
}

export function monthReport(stats: GameStat[], month: string): MonthReport {
  const inMonth = stats.filter((s) => monthKey(s.date) === month);
  const [y, m] = month.split('-').map(Number);
  const prevKey = monthKey(new Date(y, m - 2, 1).getTime());
  const prev = stats.filter((s) => monthKey(s.date) === prevKey);
  const analyzed = inMonth.filter((s) => s.accuracy !== undefined);
  const openings = new Map<string, number>();
  for (const s of inMonth) {
    const k = s.firstMoves.slice(0, 4).join(' ');
    if (k) openings.set(k, (openings.get(k) ?? 0) + 1);
  }
  const top = [...openings.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    month,
    games: inMonth.length,
    wins: inMonth.filter((s) => s.score === 1).length,
    draws: inMonth.filter((s) => s.score === 0.5).length,
    losses: inMonth.filter((s) => s.score === 0).length,
    accuracy: mean(analyzed.map((s) => s.accuracy!)),
    previousAccuracy: mean(prev.filter((s) => s.accuracy !== undefined).map((s) => s.accuracy!)),
    blundersPerGame: analyzed.length ? analyzed.reduce((a, s) => a + (s.counts?.blunder ?? 0), 0) / analyzed.length : null,
    bestGame: [...analyzed].sort((a, b) => b.accuracy! - a.accuracy!)[0],
    topOpening: top ? { moves: top[0], games: top[1] } : undefined,
  };
}

/** Mois présents dans la bibliothèque, du plus récent au plus ancien. */
export function months(stats: GameStat[]): string[] {
  return [...new Set(stats.map((s) => monthKey(s.date)))].sort().reverse();
}
