import type { MoveNode } from '../pgn/types';
import bookData from './book.json';
import { positionKey } from './positionKey.js';

const positions = new Set<string>((bookData as unknown as { positions: string[] }).positions);
const named = (bookData as unknown as { named: Record<string, [string, string]> }).named;

/**
 * Coups théoriques : un coup est « Théorique » si la position obtenue figure dans le livre
 * et que tous les coups précédents l'étaient aussi. Renvoie aussi l'ouverture la plus précise atteinte.
 */
export function lookupBook(startFen: string, moves: MoveNode[]): { inBook: boolean[]; opening?: { eco: string; name: string } } {
  const inBook: boolean[] = [];
  let still = positionKey(startFen) === positionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  let opening: { eco: string; name: string } | undefined;
  for (const m of moves) {
    const key = positionKey(m.fenAfter);
    still = still && positions.has(key);
    inBook.push(still);
    // Le nom de l'ouverture suit aussi les transpositions, même hors de la ligne stricte.
    const n = named[key];
    if (n && (still || inBook.length <= 30)) opening = { eco: n[0], name: n[1] };
  }
  return { inBook, opening };
}
