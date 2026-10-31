import { Chess } from 'chess.js';
import { positionKey } from '../../analysis/positionKey.js';
import type { TheoryLine } from './openings';

export type Tree = Record<string, [string, number, string?][]>;

let cache: Promise<Tree> | null = null;
/** Arbre des suites théoriques, chargé à la demande (fichier séparé, hors ligne). */
export function loadTree(): Promise<Tree> {
  cache ??= import('./tree.json').then((m) => m.default as unknown as Tree);
  return cache;
}

export interface Suggestion {
  san: string;
  count: number;
  name?: string;
  /** Coup de la ligne étudiée. */
  inLine: boolean;
}

/**
 * Au plus 4 suites théoriques, triées par popularité. Le coup de la ligne étudiée est toujours proposé,
 * même s'il est moins répandu (ou absent de la base).
 */
export function suggestions(tree: Tree, fen: string, lineNext?: string, lineName?: string): Suggestion[] {
  const all: Suggestion[] = (tree[positionKey(fen)] ?? []).map(([san, count, name]) => ({ san, count, name, inLine: san === lineNext }));
  let list = all.slice(0, 4);
  if (lineNext && !list.some((s) => s.san === lineNext)) {
    const own = all.find((s) => s.san === lineNext) ?? { san: lineNext, count: 0, name: lineName, inLine: true };
    list = [...all.slice(0, 3), own];
  }
  return list.sort((a, b) => b.count - a.count);
}

/** Positions (FEN) après chaque demi-coup d'une suite de coups SAN. */
export function fensOf(moves: string[]): string[] {
  const c = new Chess();
  const out = [c.fen()];
  for (const san of moves) {
    c.move(san);
    out.push(c.fen());
  }
  return out;
}

export function notesAt(line: TheoryLine, ply: number): string | undefined {
  return line.notes[ply];
}
