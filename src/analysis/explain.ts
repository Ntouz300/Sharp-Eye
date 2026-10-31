import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { Label } from './classify';
import { PIECE_VALUE } from './config';
import { materialBalance, staticExchange } from './material';
import type { Score } from './winPercent';

/**
 * Explications en français des coups à revoir, déduites de la position et des lignes du moteur.
 * Motifs détectés : mat manqué ou subi, pièce laissée en prise, perte de matériel, fourchette,
 * clouage, enfilade, attaque à la découverte, promotion manquée, roi exposé.
 */

const NAME: Record<PieceSymbol, string> = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
const ARTICLE: Record<PieceSymbol, string> = { p: 'le pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame', k: 'le roi' };
const DE: Record<PieceSymbol, string> = { p: 'du pion', n: 'du cavalier', b: 'du fou', r: 'de la tour', q: 'de la dame', k: 'du roi' };

const value = (p: PieceSymbol) => PIECE_VALUE[p] ?? 0;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export interface ExplainInput {
  label: Label;
  fenBefore: string;
  playedUci: string;
  /** Meilleure ligne du moteur depuis la position avant le coup (UCI). */
  bestPv: string[];
  bestScore: Score;
  /** Meilleure ligne de l'adversaire après le coup joué (UCI). */
  replyPv: string[];
  scoreAfter: Score;
}

function play(fen: string, uci: string): Chess | null {
  const c = new Chess(fen);
  try {
    c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return c;
  } catch {
    return null;
  }
}

/** Écart de matériel (en pions, du point de vue de `color`) après avoir joué la ligne. */
function materialAfterLine(fen: string, pv: string[], color: Color, plies: number): number {
  const c = new Chess(fen);
  const start = materialBalance(fen);
  let best = 0;
  for (const uci of pv.slice(0, plies)) {
    try {
      c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
    // On ne mesure qu'après une réponse de l'adversaire (fin d'échange).
    const diff = (materialBalance(c.fen()) - start) * (color === 'w' ? 1 : -1);
    if (c.turn() === color) best = diff;
  }
  return best;
}

/** Pièces adverses de valeur attaquées par la pièce posée sur `sq`. */
function attackedTargets(c: Chess, sq: Square): { square: Square; type: PieceSymbol }[] {
  const piece = c.get(sq);
  if (!piece) return [];
  const targets: { square: Square; type: PieceSymbol }[] = [];
  for (const row of c.board()) {
    for (const t of row) {
      if (!t || t.color === piece.color) continue;
      if (c.attackers(t.square, piece.color).includes(sq)) targets.push({ square: t.square, type: t.type });
    }
  }
  return targets;
}

/** Fourchette : la pièce arrivée attaque au moins deux cibles qui valent plus qu'elle (ou le roi). */
function fork(c: Chess, sq: Square): string | null {
  const piece = c.get(sq);
  if (!piece) return null;
  // Cibles : le roi, une pièce qui vaut plus que l'attaquant, ou une pièce de valeur non défendue.
  const targets = attackedTargets(c, sq).filter(
    (t) => t.type === 'k' || value(t.type) > value(piece.type) || (value(t.type) >= 3 && !c.isAttacked(t.square, other(piece.color))),
  );
  if (targets.length < 2) return null;
  targets.sort((a, b) => (b.type === 'k' ? 100 : value(b.type)) - (a.type === 'k' ? 100 : value(a.type)));
  return `une fourchette ${DE[piece.type]} en ${sq} sur ${ARTICLE[targets[0].type]} et ${ARTICLE[targets[1].type]}`;
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function sqAt(f: number, r: number): Square | null {
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? ((String.fromCharCode(97 + f) + (r + 1)) as Square) : null;
}

/** Clouage ou enfilade créé par la pièce à longue portée posée sur `sq`. */
function lineTactic(c: Chess, sq: Square): string | null {
  const piece = c.get(sq);
  if (!piece || !['b', 'r', 'q'].includes(piece.type)) return null;
  const f0 = sq.charCodeAt(0) - 97;
  const r0 = Number(sq[1]) - 1;
  for (const [df, dr] of DIRS) {
    const diagonal = df !== 0 && dr !== 0;
    if (piece.type === 'b' && !diagonal) continue;
    if (piece.type === 'r' && diagonal) continue;
    const hits: { type: PieceSymbol; color: Color; square: Square }[] = [];
    for (let k = 1; k < 8 && hits.length < 2; k++) {
      const s = sqAt(f0 + df * k, r0 + dr * k);
      if (!s) break;
      const p = c.get(s);
      if (p) hits.push({ type: p.type, color: p.color, square: s });
    }
    if (hits.length < 2 || hits.some((h) => h.color === piece.color)) continue;
    const [front, back] = hits;
    const fv = front.type === 'k' ? 100 : value(front.type);
    const bv = back.type === 'k' ? 100 : value(back.type);
    if (bv > fv && fv < value(piece.type) + 3 && bv > value(piece.type)) return `un clouage ${DE[front.type]} en ${front.square} sur ${ARTICLE[back.type]}`;
    if (fv > bv && fv > value(piece.type) && back.type !== 'p') return `une enfilade : ${ARTICLE[front.type]} en ${front.square} doit bouger et laisse ${ARTICLE[back.type]} en ${back.square}`;
  }
  return null;
}

/** Attaque à la découverte : le coup démasque une pièce à longue portée qui attaque une cible de valeur. */
function discovered(before: string, uci: string): string | null {
  const b = new Chess(before);
  const a = play(before, uci);
  if (!a) return null;
  const color = b.turn();
  const from = uci.slice(0, 2) as Square;
  for (const row of a.board()) {
    for (const t of row) {
      if (!t || t.color === color || (t.type !== 'k' && value(t.type) < 5)) continue;
      const nowAttackers = a.attackers(t.square, color).filter((s) => s !== uci.slice(2, 4));
      const beforeAttackers = new Set(b.attackers(t.square, color));
      const fresh = nowAttackers.find((s) => !beforeAttackers.has(s) && s !== from);
      if (fresh) return `une attaque à la découverte ${DE[a.get(fresh)!.type]} en ${fresh} sur ${ARTICLE[t.type]}`;
    }
  }
  return null;
}

/** Pièce du joueur laissée sans protection suffisante après son coup. */
function hangingPiece(after: Chess, color: Color): { type: PieceSymbol; square: Square; gain: number } | null {
  let worst: { type: PieceSymbol; square: Square; gain: number } | null = null;
  for (const row of after.board()) {
    for (const t of row) {
      if (!t || t.color !== color || t.type === 'k') continue;
      if (!after.isAttacked(t.square, other(color))) continue;
      const gain = staticExchange(after, t.square);
      if (gain >= 1 && (!worst || gain > worst.gain)) worst = { type: t.type, square: t.square, gain };
    }
  }
  return worst;
}

function kingExposed(before: string, uci: string): boolean {
  const c = new Chess(before);
  const color = c.turn();
  const piece = c.get(uci.slice(0, 2) as Square);
  if (!piece) return false;
  const kingSq = c.findPiece({ type: 'k', color })[0];
  if (!kingSq) return false;
  const hasQueens = /q/i.test(before.split(' ')[0].replace(color === 'w' ? /[^q]/g : /[^Q]/g, ''));
  const kf = kingSq.charCodeAt(0) - 97;
  const homeRank = color === 'w' ? '1' : '8';
  // Pion qui quitte l'abri du roi roqué.
  if (piece.type === 'p' && kingSq[1] === homeRank && Math.abs(uci.charCodeAt(0) - 97 - kf) <= 1 && (kf <= 2 || kf >= 5)) return hasQueens;
  // Roi qui avance au centre, dames sur l'échiquier.
  if (piece.type === 'k' && !/O-O/.test(uci) && Math.abs(uci.charCodeAt(2) - uci.charCodeAt(0)) < 2 && uci[3] !== homeRank) return hasQueens;
  return false;
}

/** Phrase principale décrivant le motif manqué par le meilleur coup. */
function missedMotif(input: ExplainInput, color: Color): string | null {
  const best = input.bestPv[0];
  if (!best) return null;
  const mateFor = input.bestScore.mate !== undefined && (color === 'w' ? input.bestScore.mate > 0 : input.bestScore.mate < 0);
  if (mateFor) return `Tu manques un mat en ${Math.abs(input.bestScore.mate!)}.`;
  const after = play(input.fenBefore, best);
  if (!after) return null;
  const to = best.slice(2, 4) as Square;
  if (best.length === 5) return `Tu manques la promotion en ${to}.`;
  const f = fork(after, to);
  if (f) return `Tu manques ${f}.`;
  const l = lineTactic(after, to);
  if (l) return `Tu manques ${l}.`;
  const d = discovered(input.fenBefore, best);
  if (d) return `Tu manques ${d}.`;
  const captured = new Chess(input.fenBefore).get(to);
  const gain = materialAfterLine(input.fenBefore, input.bestPv, color, 6);
  if (captured && gain >= 2) return `Tu manques le gain ${DE[captured.type]} en ${to}.`;
  if (gain >= 2) return `Tu manques une suite qui gagne environ ${gain} point${gain > 1 ? 's' : ''} de matériel.`;
  return null;
}

/** Phrase principale décrivant ce que le coup joué concède. */
function concededMotif(input: ExplainInput, color: Color): string | null {
  const after = play(input.fenBefore, input.playedUci);
  if (!after) return null;
  const mateAgainst = input.scoreAfter.mate !== undefined && (color === 'w' ? input.scoreAfter.mate < 0 : input.scoreAfter.mate > 0);
  if (mateAgainst) return `Ce coup permet un mat en ${Math.abs(input.scoreAfter.mate!)}.`;
  const reply = input.replyPv[0];
  if (reply) {
    const r = play(after.fen(), reply);
    const to = reply.slice(2, 4) as Square;
    if (r) {
      const f = fork(r, to);
      if (f) return `Ce coup permet ${f}.`;
      const l = lineTactic(r, to);
      if (l) return `Ce coup permet ${l}.`;
      const d = discovered(after.fen(), reply);
      if (d) return `Ce coup permet ${d}.`;
    }
  }
  const hanging = hangingPiece(after, color);
  if (hanging) return `Ce coup laisse ${ARTICLE[hanging.type]} en ${hanging.square} sans protection.`;
  const loss = -materialAfterLine(after.fen(), input.replyPv, color, 6);
  if (loss >= 2) return `Ce coup perd environ ${loss} points de matériel après la meilleure réponse.`;
  if (kingExposed(input.fenBefore, input.playedUci)) return 'Ce coup affaiblit la protection de ton roi.';
  return null;
}

export function explainMove(input: ExplainInput): string | null {
  const color = new Chess(input.fenBefore).turn();
  if (input.label === 'miss') return missedMotif(input, color) ?? 'Ton adversaire venait de se tromper : il y avait un coup gagnant à trouver.';
  if (!['inaccuracy', 'mistake', 'blunder'].includes(input.label)) return null;
  const conceded = concededMotif(input, color);
  const missed = missedMotif(input, color);
  if (conceded && missed) return `${conceded} ${missed}`;
  return conceded ?? missed ?? (input.label === 'inaccuracy' ? 'Un coup un peu passif : le moteur préférait une suite plus active.' : 'Ce coup fait nettement baisser tes chances de gain.');
}

export const PIECE_NAMES_FR = NAME;
