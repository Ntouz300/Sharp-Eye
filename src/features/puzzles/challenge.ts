import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { moveIdea, whyItFails } from '../../analysis/explain';
import { materialBalance } from '../../analysis/material';
import { winPercentFor, type Score } from '../../analysis/winPercent';
import type { PositionEval } from '../../engine/types';
import type { StoredPuzzle } from '../../storage/db';

/**
 * Défis en plusieurs coups : on joue toute la combinaison (2 à 5 coups), le moteur défend,
 * chaque bon coup est expliqué, une erreur est réfutée sur l'échiquier.
 */

export type Goal = 'mate' | 'material' | 'decisive';
export type Evaluate = (fen: string, depth: number, multiPv: number) => Promise<PositionEval>;

export interface Challenge {
  id: string;
  source: 'bank' | 'game';
  fen: string;
  /** Combinaison en UCI : coups du joueur et réponses, terminée par un coup du joueur. */
  line: string[];
  goal: Goal;
  /** Matériel gagné (en pions) pour un défi « matériel ». */
  gain?: number;
  theme: string;
  rating: number;
  /** Tentative naturelle (UCI) suivie de sa réfutation. */
  alt?: string[];
  gameId?: string;
  moveIndex?: number;
  /** Coup joué dans ta partie (défis tirés de tes erreurs). */
  played?: string;
}

export interface BankEntry {
  fen: string;
  line: string;
  goal: Goal;
  gain?: number;
  theme: string;
  rating: number;
  alt?: string;
}

export const MIN_PLAYER_MOVES = 2;
export const MAX_PLAYER_MOVES = 5;
/** Tolérance pour accepter un autre coup que la solution : 0,3 pion, ou le même mat. */
export const ALT_TOLERANCE_CP = 30;

const NAME: Record<PieceSymbol, string> = { p: 'le pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame', k: 'le roi' };

export const playerMoves = (line: string[]) => Math.ceil(line.length / 2);

export function playUci(c: Chess, uci: string) {
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
}

/** Rejoue une suite depuis une position et renvoie la position finale (ou null si un coup est illégal). */
export function fenAfter(fen: string, moves: string[]): string | null {
  const c = new Chess(fen);
  try {
    for (const m of moves) playUci(c, m);
  } catch {
    return null;
  }
  return c.fen();
}

const materialFor = (fen: string, color: 'w' | 'b') => materialBalance(fen) * (color === 'w' ? 1 : -1);

/**
 * Coupe une suite du moteur en défi : 5 coups du joueur au plus, arrêt au mat ou dès que le matériel gagné
 * (2 pions au moins) tient après la réponse adverse, à partir du 2e coup. Le défi finit sur un coup du joueur.
 */
export function cutLine(fen: string, pv: string[]): { line: string[]; goal: Goal; gain?: number } {
  const c = new Chess(fen);
  const side = c.turn();
  const start = materialFor(fen, side);
  const line: string[] = [];
  for (let i = 0; i < pv.length && playerMoves(line) <= MAX_PLAYER_MOVES; i++) {
    try {
      playUci(c, pv[i]);
    } catch {
      break;
    }
    line.push(pv[i]);
    if (c.isCheckmate()) return { line, goal: 'mate' };
    const playerJustMoved = i % 2 === 0;
    if (!playerJustMoved) {
      const gain = materialFor(c.fen(), side) - start;
      if (playerMoves(line) >= MIN_PLAYER_MOVES && gain >= 2) return { line: line.slice(0, -1), goal: 'material', gain: Math.round(gain) };
    }
    if (playerMoves(line) === MAX_PLAYER_MOVES && playerJustMoved) break;
  }
  const trimmed = line.length % 2 === 0 ? line.slice(0, -1) : line;
  const gain = Math.round(materialFor(fenAfter(fen, trimmed) ?? fen, side) - start);
  return gain >= 2 ? { line: trimmed, goal: 'material', gain } : { line: trimmed, goal: 'decisive' };
}

/** Consigne : « Les blancs jouent et gagnent une pièce en 3 coups. » */
export function instruction(ch: Pick<Challenge, 'fen' | 'line' | 'goal' | 'gain'>): string {
  const side = new Chess(ch.fen).turn() === 'w' ? 'Les blancs' : 'Les noirs';
  const n = playerMoves(ch.line);
  const what =
    ch.goal === 'mate'
      ? 'matent'
      : ch.goal === 'material'
        ? (ch.gain ?? 0) >= 8
          ? 'gagnent la dame'
          : (ch.gain ?? 0) >= 5
            ? 'gagnent une tour'
            : (ch.gain ?? 0) >= 3
              ? 'gagnent une pièce'
              : 'gagnent du matériel'
        : 'prennent un avantage décisif';
  return `${side} jouent et ${what} en ${n} coup${n > 1 ? 's' : ''}.`;
}

/** Première position ambiguë : le 2e meilleur coup gagne aussi (ou presque autant). */
export function isAmbiguous(ev: Pick<PositionEval, 'lines'> | undefined, color: 'w' | 'b'): boolean {
  const [l1, l2] = ev?.lines ?? [];
  if (!l1 || !l2) return false;
  const mateFor = (s: Score) => s.mate !== undefined && s.mate !== 0 && (color === 'w' ? s.mate > 0 : s.mate < 0);
  if (mateFor(l2.score)) return true;
  const w1 = winPercentFor(l1.score, color);
  const w2 = winPercentFor(l2.score, color);
  return w2 >= 65 || w1 - w2 < 15;
}

export function fromBank(e: BankEntry, index: number): Challenge {
  return { id: `bank:${index}`, source: 'bank', fen: e.fen, line: e.line.split(' '), goal: e.goal, gain: e.gain, theme: e.theme, rating: e.rating, alt: e.alt?.split(' ') };
}

/** Puzzle stocké (ancien format compris) → défi en plusieurs coups ; garde son historique de révisions. */
export function fromStored(p: StoredPuzzle): Challenge {
  const cut = p.line ? { line: p.line, goal: p.goal ?? 'decisive', gain: p.gain } : cutLine(p.fen, p.solution);
  return { id: p.id, source: p.label === 'bank' ? 'bank' : 'game', fen: p.fen, line: cut.line, goal: cut.goal, gain: cut.gain, theme: p.theme, rating: p.rating, gameId: p.gameId, moveIndex: p.moveIndex, played: p.played };
}

/** Défi de la banque → fiche de révision (créée à la première tentative, révisée ensuite comme les autres). */
export function toStored(ch: Challenge, now = Date.now()): StoredPuzzle {
  return {
    id: ch.id,
    gameId: ch.gameId ?? 'bank',
    moveIndex: ch.moveIndex ?? 0,
    fen: ch.fen,
    solution: ch.line,
    played: ch.played ?? '',
    label: 'bank',
    theme: ch.theme,
    rating: ch.rating,
    due: now,
    stage: 0,
    attempts: 0,
    successes: 0,
    createdAt: now,
    version: 2,
    line: ch.line,
    goal: ch.goal,
    gain: ch.gain,
  };
}

/** Allonge une combinaison trop courte (ancien puzzle à un seul coup) avec le moteur, jusqu'à 2 coups du joueur. */
export async function ensureLine(ch: Challenge, evaluate: Evaluate): Promise<Challenge> {
  if (playerMoves(ch.line) >= MIN_PLAYER_MOVES) return ch;
  const pos = fenAfter(ch.fen, ch.line);
  if (!pos) return ch;
  const ev = await evaluate(pos, 14, 1);
  const pv = ev.lines[0]?.pv ?? [];
  const cut = cutLine(ch.fen, [...ch.line, ...pv]);
  return playerMoves(cut.line) >= MIN_PLAYER_MOVES ? { ...ch, ...cut } : { ...ch, line: [...ch.line, ...pv.slice(0, 2)].slice(0, 3) };
}

export type Verdict =
  | { kind: 'exact' }
  | { kind: 'alternative'; line: string[] }
  | { kind: 'wrong'; reply: string[]; reason: string };

const sameMove = (a: string, b: string) => a === b || (a.length === 5 && b.length === 5 ? a === b : a.slice(0, 4) === b.slice(0, 4) && (a[4] ?? 'q') === (b[4] ?? 'q'));

/**
 * Juge le coup du joueur au demi-coup `step` (pair) : exact, autre coup qui gagne autant (≤ 0,3 pion ou même mat :
 * la suite est alors recalculée), ou erreur avec sa réfutation.
 */
export async function judge(ch: Challenge, step: number, uci: string, evaluate: Evaluate, depth = 12): Promise<Verdict> {
  const expected = ch.line[step];
  if (sameMove(uci, expected)) return { kind: 'exact' };
  const before = fenAfter(ch.fen, ch.line.slice(0, step))!;
  const color = new Chess(before).turn();
  const mine = fenAfter(before, [uci]);
  if (!mine) return { kind: 'wrong', reply: [], reason: 'Ce coup n’est pas possible.' };
  if (new Chess(mine).isCheckmate()) return { kind: 'alternative', line: [...ch.line.slice(0, step), uci] };
  // Un seul moteur : les deux positions sont évaluées l'une après l'autre.
  const a = await evaluate(mine, depth, 1);
  const b = await evaluate(fenAfter(before, [expected])!, depth, 1);
  const sa = a.lines[0]?.score ?? { cp: 0 };
  const sb = b.lines[0]?.score ?? { cp: 0 };
  const mateFor = (s: Score) => s.mate !== undefined && s.mate !== 0 && (color === 'w' ? s.mate > 0 : s.mate < 0);
  const cp = (s: Score) => (s.mate !== undefined ? (s.mate > 0 ? 10000 : -10000) : (s.cp ?? 0)) * (color === 'w' ? 1 : -1);
  const asGood = mateFor(sb) ? mateFor(sa) && Math.abs(sa.mate!) <= Math.abs(sb.mate!) : !mateFor(sa) ? cp(sb) - cp(sa) <= ALT_TOLERANCE_CP : true;
  if (asGood) {
    // La suite continue depuis le coup du joueur, avec la défense du moteur, sur le même nombre de coups.
    const remaining = ch.line.length - step - 1;
    return { kind: 'alternative', line: [...ch.line.slice(0, step), uci, ...(a.lines[0]?.pv ?? []).slice(0, remaining)] };
  }
  const beforeEval = await evaluate(before, depth, 1);
  const reply = (a.lines[0]?.pv ?? []).slice(0, 1);
  return { kind: 'wrong', reply, reason: whyItFails(before, uci, a.lines[0]?.pv ?? [], sa, beforeEval.lines[0]?.score ?? sb) };
}

/** Phrase courte après un bon coup : « Fourchette sur le roi et la tour. » */
export function stepPhrase(fen: string, pv: string[]): string {
  const c = new Chess(fen);
  try {
    playUci(c, pv[0]);
    if (c.isCheckmate()) return 'Échec et mat !';
  } catch {
    return '';
  }
  const idea = moveIdea(fen, pv);
  if (!idea) return 'Bon coup.';
  return idea.charAt(0).toUpperCase() + idea.slice(1) + '.';
}

const KEY_IDEA = /mat|fourchette|cloue|enfilade|découvre|va à dame|sacrifi/i;

/**
 * Résumé de la combinaison pour « Pourquoi c'est le meilleur » : le but, puis l'idée clé parmi les coups
 * du joueur (mat, fourchette, clouage… plutôt que « gagne un pion »).
 */
export function keyIdea(ch: Pick<Challenge, 'fen' | 'line' | 'goal' | 'gain'>): string {
  const phrases: string[] = [];
  for (let s = 0; s < ch.line.length; s += 2) {
    const pos = fenAfter(ch.fen, ch.line.slice(0, s));
    if (pos) phrases.push(stepPhrase(pos, ch.line.slice(s)));
  }
  const idea = phrases.find((p) => KEY_IDEA.test(p)) ?? phrases[0] ?? '';
  const goal = instruction(ch).replace(/^Les (blancs|noirs) jouent et /, '').replace(/ en \d+ coups?\.$/, '');
  const head = goal.replace(/^matent/, 'Mater').replace(/^gagnent/, 'Gagner').replace(/^prennent/, 'Prendre');
  if (!idea || /mat/.test(goal) && /mat/i.test(idea)) return `${head}.`;
  return `${head} : ${idea.charAt(0).toLowerCase()}${idea.slice(1)}`;
}

/** Indices : 1 = thème, 2 = pièce à jouer, 3 = case d'arrivée. */
export function hint(ch: Challenge, step: number, level: 1 | 2 | 3): { text: string; square?: string } {
  const before = fenAfter(ch.fen, ch.line.slice(0, step))!;
  const uci = ch.line[step];
  const piece = new Chess(before).get(uci.slice(0, 2) as Square);
  if (level === 1) return { text: `Thème : ${ch.theme.toLowerCase()}.` };
  if (level === 2) return { text: `Joue ${piece ? NAME[piece.type] : 'la pièce'} en ${uci.slice(0, 2)}.`, square: uci.slice(0, 2) };
  return { text: `Vers ${uci.slice(2, 4)}.`, square: uci.slice(2, 4) };
}

/** Points d'un défi : 3, moins un par indice et par erreur. */
export const points = (hints: number, wrongs: number) => Math.max(0, 3 - hints - wrongs);

// ---------- Difficulté adaptative ----------

export interface Level {
  rating: number;
  wins: number;
  losses: number;
}

export const START_LEVEL: Level = { rating: 1200, wins: 0, losses: 0 };
export const LEVEL_STEP = 150;

/** 3 réussites de suite font monter le niveau proposé, 2 échecs de suite le font baisser. */
export function nextLevel(l: Level, success: boolean): Level {
  if (success) {
    const wins = l.wins + 1;
    return wins >= 3 ? { rating: Math.min(2600, l.rating + LEVEL_STEP), wins: 0, losses: 0 } : { ...l, wins, losses: 0 };
  }
  const losses = l.losses + 1;
  return losses >= 2 ? { rating: Math.max(600, l.rating - LEVEL_STEP), wins: 0, losses: 0 } : { ...l, wins: 0, losses };
}

/** Défi de la banque le plus proche du niveau, dans un thème, en évitant ceux déjà faits. */
export function pickBank(bank: Challenge[], level: Level, theme: string | null, done: Set<string>, random = Math.random): Challenge | undefined {
  const pool = bank.filter((c) => (!theme || c.theme === theme) && !done.has(c.id));
  const list = pool.length ? pool : bank.filter((c) => !theme || c.theme === theme);
  const near = [...list].sort((a, b) => Math.abs(a.rating - level.rating) - Math.abs(b.rating - level.rating)).slice(0, 8);
  return near[Math.floor(random() * near.length)];
}
