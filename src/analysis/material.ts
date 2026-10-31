import { Chess, type Move, type Square } from 'chess.js';
import { PIECE_VALUE } from './config';

const value = (p: string) => PIECE_VALUE[p] ?? 0;

/** Gain matériel (en pions) que le camp au trait obtient en lançant un échange sur la case, avec le droit de s'arrêter. */
export function staticExchange(chess: Chess, square: Square): number {
  const captures = chess
    .moves({ verbose: true })
    .filter((m) => m.to === square && m.captured && !m.flags.includes('e'));
  if (!captures.length) return 0;
  captures.sort((a, b) => value(a.piece) - value(b.piece));
  const m = captures[0];
  const gained = value(m.captured!) + (m.promotion ? value(m.promotion) - 1 : 0);
  chess.move(m);
  const reply = staticExchange(chess, square);
  chess.undo();
  return Math.max(0, gained - reply);
}

/**
 * Perte matérielle nette (en pions) qu'un coup offre à l'adversaire : meilleur échange possible
 * sur une pièce du joueur après le coup, moins ce que le coup a lui-même capturé.
 */
export function sacrificedMaterial(fenBefore: string, uci: string): number {
  const chess = new Chess(fenBefore);
  const mover = chess.turn();
  let move: Move;
  try {
    move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return 0;
  }
  const capturedNow = move.captured ? value(move.captured) : 0;
  if (chess.isCheckmate()) return 0;
  let worst = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== mover || sq.type === 'k') continue;
      if (!chess.isAttacked(sq.square, mover === 'w' ? 'b' : 'w')) continue;
      worst = Math.max(worst, staticExchange(chess, sq.square));
    }
  }
  return worst - capturedNow;
}

/** Le coup reprend sur la case où l'adversaire vient de capturer. */
export function isRecapture(prevUci: string | undefined, prevWasCapture: boolean, uci: string): boolean {
  return !!prevUci && prevWasCapture && prevUci.slice(2, 4) === uci.slice(2, 4);
}

/** Nombre de pièces (hors rois et pions) sur l'échiquier. */
export function majorsAndMinors(fen: string): number {
  const board = fen.split(' ')[0];
  return (board.match(/[nbrqNBRQ]/g) ?? []).length;
}

/** Bilan matériel côté blancs (en pions). */
export function materialBalance(fen: string): number {
  let total = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = PIECE_VALUE[ch.toLowerCase()];
    if (v === undefined) continue;
    total += ch === ch.toUpperCase() ? v : -v;
  }
  return total;
}
