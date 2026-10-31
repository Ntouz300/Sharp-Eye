import type { GameAnalysis, Phase } from '../../analysis/analyzeGame';
import type { Label } from '../../analysis/classify';
import { speedOf, type Speed } from '../../pgn/parser';
import type { StoredGame, StoredPuzzle } from '../../storage/db';

export interface GameStat {
  id: string;
  date: number;
  color: 'w' | 'b';
  opponent: string;
  speed: Speed;
  /** 1 gain, 0,5 nulle, 0 perte (pour l'utilisateur). */
  score: number | null;
  accuracy?: number;
  phases?: Partial<Record<Phase, number>>;
  counts?: Partial<Record<Label, number>>;
  lostOnTime: boolean;
  firstMoves: string[];
  /** Coups du joueur faits en moins de 3 s qui ont coûté une erreur ou une gaffe. */
  hastyErrors: number;
  analysis?: GameAnalysis;
}

export function parseDate(g: StoredGame): number {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})/.exec(g.date ?? '');
  if (m && m[1] !== '????') {
    const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return g.importedAt;
}

/** Pseudo le plus fréquent de la bibliothèque, utilisé si l'utilisateur n'a pas indiqué les siens. */
export function inferMe(games: StoredGame[]): string[] {
  const counts = new Map<string, number>();
  for (const g of games) for (const n of [g.white, g.black]) counts.set(n.toLowerCase(), (counts.get(n.toLowerCase()) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 ? [top[0]] : [];
}

export function gameStats(games: StoredGame[], analyses: Map<string, GameAnalysis>, me: string[]): GameStat[] {
  const names = new Set(me.map((n) => n.toLowerCase()));
  const out: GameStat[] = [];
  for (const g of games) {
    const color: 'w' | 'b' | null = names.has(g.white.toLowerCase()) ? 'w' : names.has(g.black.toLowerCase()) ? 'b' : null;
    if (!color) continue;
    const a = analyses.get(g.id);
    const score = g.result === '1/2-1/2' ? 0.5 : g.result === '1-0' ? (color === 'w' ? 1 : 0) : g.result === '0-1' ? (color === 'b' ? 1 : 0) : null;
    const mine = a ? (color === 'w' ? a.white : a.black) : undefined;
    out.push({
      id: g.id,
      date: parseDate(g),
      color,
      opponent: color === 'w' ? g.black : g.white,
      speed: speedOf(g.timeControl),
      score,
      accuracy: mine?.accuracy ?? undefined,
      phases: mine?.phases,
      counts: mine?.counts,
      lostOnTime: score === 0 && /temps|time/i.test(g.termination ?? ''),
      firstMoves: (g.firstMoves ?? '').split(' ').filter(Boolean),
      hastyErrors: 0,
      analysis: a,
    });
  }
  return out.sort((x, y) => x.date - y.date);
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function groupAccuracy<K extends string>(stats: GameStat[], key: (s: GameStat) => K): { key: K; games: number; accuracy: number | null; score: number | null }[] {
  const groups = new Map<K, GameStat[]>();
  for (const s of stats) {
    const k = key(s);
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.entries()].map(([k, list]) => ({
    key: k,
    games: list.length,
    accuracy: mean(list.map((s) => s.accuracy).filter((x): x is number => x !== undefined)),
    score: mean(list.map((s) => s.score).filter((x): x is number => x !== null)),
  }));
}

/** Nombre moyen de coups par étiquette sur une série de parties analysées. */
export function labelRates(stats: GameStat[]): Partial<Record<Label, number>> {
  const analyzed = stats.filter((s) => s.counts);
  const out: Partial<Record<Label, number>> = {};
  if (!analyzed.length) return out;
  for (const s of analyzed) for (const [k, v] of Object.entries(s.counts!)) out[k as Label] = (out[k as Label] ?? 0) + (v ?? 0);
  for (const k of Object.keys(out) as Label[]) out[k] = out[k]! / analyzed.length;
  return out;
}

export interface RepertoireNode {
  san: string;
  games: number;
  score: number;
  accuracy: number | null;
  children: RepertoireNode[];
}

/** Arbre des ouvertures jouées avec une couleur (8 demi-coups au plus). */
export function repertoire(stats: GameStat[], color: 'w' | 'b', depth = 8): RepertoireNode {
  const root: RepertoireNode & { _acc: number[]; _scores: number[] } = { san: '', games: 0, score: 0, accuracy: null, children: [], _acc: [], _scores: [] };
  type N = typeof root;
  for (const s of stats) {
    if (s.color !== color || !s.firstMoves.length) continue;
    let node: N = root;
    node.games++;
    for (const san of s.firstMoves.slice(0, depth)) {
      let child = node.children.find((c) => c.san === san) as N | undefined;
      if (!child) {
        child = { san, games: 0, score: 0, accuracy: null, children: [], _acc: [], _scores: [] };
        node.children.push(child);
      }
      child.games++;
      if (s.score !== null) child._scores.push(s.score);
      if (s.accuracy !== undefined) child._acc.push(s.accuracy);
      node = child;
    }
  }
  const finalize = (n: N): RepertoireNode => ({
    san: n.san,
    games: n.games,
    score: mean(n._scores) ?? 0,
    accuracy: mean(n._acc),
    children: (n.children as N[]).sort((a, b) => b.games - a.games).map(finalize),
  });
  return finalize(root);
}

/** Thèmes tactiques les plus souvent manqués, d'après les puzzles tirés des parties. */
export function weaknesses(puzzles: StoredPuzzle[]): { theme: string; count: number; failed: number }[] {
  const m = new Map<string, { count: number; failed: number }>();
  for (const p of puzzles) {
    const e = m.get(p.theme) ?? { count: 0, failed: 0 };
    e.count++;
    e.failed += p.attempts - p.successes;
    m.set(p.theme, e);
  }
  return [...m.entries()].map(([theme, v]) => ({ theme, ...v })).sort((a, b) => b.count - a.count);
}
