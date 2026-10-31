import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { Label } from './classify';
import { PIECE_VALUE } from './config';
import { materialBalance, staticExchange } from './material';
import { winPercentFor, type Score } from './winPercent';

/**
 * Explications en français des coups, déduites de la position et des lignes du moteur.
 * Chaque explication dit ce qui se passe concrètement (pièce, case, matériel, menace) et nomme
 * le meilleur coup avec sa raison. Deux formes : `text` pour l'écran (2 phrases au plus) et
 * `spoken` pour la narration (15 mots au plus, jamais de centipions).
 */

/** Version des règles : une revue enregistrée avec une version plus ancienne est reconstruite à l'ouverture. */
export const EXPLAIN_VERSION = 2;

const NAME: Record<PieceSymbol, string> = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
const ARTICLE: Record<PieceSymbol, string> = { p: 'le pion', n: 'le cavalier', b: 'le fou', r: 'la tour', q: 'la dame', k: 'le roi' };
const DE: Record<PieceSymbol, string> = { p: 'du pion', n: 'du cavalier', b: 'du fou', r: 'de la tour', q: 'de la dame', k: 'du roi' };

const value = (p: PieceSymbol) => PIECE_VALUE[p] ?? 0;
const kv = (p: PieceSymbol) => (p === 'k' ? 100 : value(p));
const FR_LETTER: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
/** SAN anglaise → notation française (R D T F C), comme le reste de l'app. */
const frSan = (san: string) => san.replace(/^[KQRBN]/, (x) => FR_LETTER[x]).replace(/=([QRBN])/, (_m, x: string) => '=' + FR_LETTER[x]);
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


/** Pièces adverses attaquées par la pièce posée sur `sq`. */
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

interface Fork {
  piece: PieceSymbol;
  square: Square;
  targets: PieceSymbol[];
}

/** Fourchette : la pièce arrivée attaque au moins deux cibles qui valent plus qu'elle (ou le roi). */
function fork(c: Chess, sq: Square): Fork | null {
  const piece = c.get(sq);
  if (!piece) return null;
  const targets = attackedTargets(c, sq).filter(
    (t) => t.type === 'k' || value(t.type) > value(piece.type) || (value(t.type) >= 3 && !c.isAttacked(t.square, other(piece.color))),
  );
  if (targets.length < 2) return null;
  targets.sort((a, b) => kv(b.type) - kv(a.type));
  return { piece: piece.type, square: sq, targets: [targets[0].type, targets[1].type] };
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

interface LineTactic {
  kind: 'pin' | 'skewer';
  front: PieceSymbol;
  frontSq: Square;
  back: PieceSymbol;
}

/** Clouage ou enfilade créé par la pièce à longue portée posée sur `sq`. */
function lineTactic(c: Chess, sq: Square): LineTactic | null {
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
    const fv = kv(front.type);
    const bv = kv(back.type);
    if (bv > fv && fv < value(piece.type) + 3 && bv > value(piece.type)) return { kind: 'pin', front: front.type, frontSq: front.square, back: back.type };
    if (fv > bv && fv > value(piece.type) && back.type !== 'p') return { kind: 'skewer', front: front.type, frontSq: front.square, back: back.type };
  }
  return null;
}

/** Attaque à la découverte : le coup démasque une pièce à longue portée qui attaque une cible de valeur. */
function discovered(before: string, uci: string): { piece: PieceSymbol; target: PieceSymbol } | null {
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
      if (fresh) return { piece: a.get(fresh)!.type, target: t.type };
    }
  }
  return null;
}

/** Pièce du camp `color` attaquée et perdable (échange favorable à l'adversaire), la plus chère. */
function hangingPiece(pos: Chess, color: Color): { type: PieceSymbol; square: Square; gain: number } | null {
  let worst: { type: PieceSymbol; square: Square; gain: number } | null = null;
  // staticExchange suppose que l'adversaire est au trait.
  const fen = pos.fen().split(' ');
  fen[1] = other(color);
  fen[3] = '-';
  let c: Chess;
  try {
    c = new Chess(fen.join(' '));
  } catch {
    return null;
  }
  for (const row of c.board()) {
    for (const t of row) {
      if (!t || t.color !== color || t.type === 'k') continue;
      if (!c.isAttacked(t.square, other(color))) continue;
      const gain = staticExchange(c, t.square);
      if (gain >= 1 && (!worst || gain > worst.gain)) worst = { type: t.type, square: t.square, gain };
    }
  }
  return worst;
}

const hasQueens = (fen: string, color: Color) => (color === 'w' ? /Q/ : /q/).test(fen.split(' ')[0]);
const pieceCount = (fen: string) => fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length;

function kingExposed(before: string, uci: string): boolean {
  const c = new Chess(before);
  const color = c.turn();
  const piece = c.get(uci.slice(0, 2) as Square);
  if (!piece) return false;
  const kingSq = c.findPiece({ type: 'k', color })[0];
  if (!kingSq) return false;
  const queens = hasQueens(before, other(color));
  const kf = kingSq.charCodeAt(0) - 97;
  const homeRank = color === 'w' ? '1' : '8';
  if (piece.type === 'p' && kingSq[1] === homeRank && Math.abs(uci.charCodeAt(0) - 97 - kf) <= 1 && (kf <= 2 || kf >= 5)) return queens;
  if (piece.type === 'k' && Math.abs(uci.charCodeAt(2) - uci.charCodeAt(0)) < 2 && uci[3] !== homeRank) return queens;
  return false;
}

/** Pion passé : aucun pion adverse devant lui, sur sa colonne ou les colonnes voisines. */
function isPassed(c: Chess, sq: Square, color: Color): boolean {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  for (const row of c.board())
    for (const t of row) {
      if (!t || t.type !== 'p' || t.color === color) continue;
      const tf = t.square.charCodeAt(0) - 97;
      const tr = Number(t.square[1]);
      if (Math.abs(tf - f) <= 1 && (color === 'w' ? tr > r : tr < r)) return false;
    }
  return true;
}

/** Matériel en mots simples : « un pion », « la qualité », « une pièce », « une tour », « la dame ». */
function materialWords(points: number): string {
  if (points >= 8) return 'la dame';
  if (points >= 5) return 'une tour';
  if (points >= 3) return 'une pièce';
  if (points >= 2) return 'la qualité';
  return points >= 1.5 ? 'deux pions' : 'un pion';
}

const mateFor = (score: Score, color: Color) => score.mate !== undefined && score.mate !== 0 && (color === 'w' ? score.mate > 0 : score.mate < 0);

/**
 * Ce que fait un coup, en une proposition courte sans sujet : « gagne le fou », « fait une fourchette
 * sur le roi et la tour », « met ton roi à l'abri ». `pv` commence par ce coup. Null si rien de net.
 */
export function moveIdea(fenBefore: string, pv: string[], score?: Score): string | null {
  const uci = pv[0];
  if (!uci) return null;
  const before = new Chess(fenBefore);
  const color = before.turn();
  const after = play(fenBefore, uci);
  if (!after) return null;
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const piece = before.get(from)!;
  const captured = before.get(to);
  if (after.isCheckmate()) return 'fait échec et mat';
  if (score && mateFor(score, color)) return `force le mat en ${Math.abs(score.mate!)}`;
  if (uci.length === 5) return uci[4] === 'q' ? 'va à dame' : `promeut en ${NAME[uci[4] as PieceSymbol]}`;
  const f = fork(after, to);
  if (f) return `fait une fourchette sur ${ARTICLE[f.targets[0]]} et ${ARTICLE[f.targets[1]]}`;
  const gain = materialAfterLine(fenBefore, pv, color, 6);
  if (captured && gain >= 1) return `gagne ${captured.type === 'p' ? 'un pion' : ARTICLE[captured.type]}`;
  const l = lineTactic(after, to);
  if (l && l.front !== 'p') return l.kind === 'pin' ? `cloue ${ARTICLE[l.front]} sur ${ARTICLE[l.back]}` : `attaque ${ARTICLE[l.front]} et ${ARTICLE[l.back]} en enfilade`;
  const d = discovered(fenBefore, uci);
  if (d) return `découvre une attaque sur ${ARTICLE[d.target]}`;
  if (gain >= 1) return `gagne ${materialWords(gain)}`;
  if (captured) return `reprend ${ARTICLE[captured.type]}`;
  // Sauver une pièce menacée.
  const threatened = hangingPiece(before, color);
  if (threatened && !hangingPiece(after, color)) return threatened.square === from ? `met ${ARTICLE[threatened.type]} à l'abri` : `protège ${ARTICLE[threatened.type]} en ${threatened.square}`;
  if (piece.type === 'k' && Math.abs(to.charCodeAt(0) - from.charCodeAt(0)) === 2) return "met ton roi à l'abri";
  // Menace : attaque une pièce plus chère.
  const target = attackedTargets(after, to)
    .filter((t) => t.type !== 'k' && value(t.type) > value(piece.type))
    .sort((a, b) => value(b.type) - value(a.type))[0];
  if (target) return `attaque ${ARTICLE[target.type]}`;
  if (after.inCheck()) return 'met le roi adverse en échec';
  const move = before.moveNumber();
  const home = color === 'w' ? '1' : '8';
  if (move <= 12 && (piece.type === 'n' || piece.type === 'b') && from[1] === home) return `développe ${ARTICLE[piece.type]}`;
  if (move <= 12 && piece.type === 'p' && 'de'.includes(to[0]) && '45'.includes(to[1])) return 'prend le centre';
  if (piece.type === 'p' && isPassed(after, to, color)) return 'pousse le pion passé';
  if (piece.type === 'k' && pieceCount(fenBefore) <= 6) return 'active le roi';
  return null;
}

/** Ce que concède le coup joué, en une phrase courte. Null si rien de concret. */
function concession(input: ExplainInput, color: Color): string | null {
  const after = play(input.fenBefore, input.playedUci);
  if (!after) return null;
  if (input.scoreAfter.mate !== undefined && mateFor(input.scoreAfter, other(color))) return `Tu permets un mat en ${Math.abs(input.scoreAfter.mate)}.`;
  const reply = input.replyPv[0];
  if (reply) {
    const r = play(after.fen(), reply);
    const to = reply.slice(2, 4) as Square;
    if (r) {
      const f = fork(r, to);
      if (f) return `Tu permets une fourchette sur ${ARTICLE[f.targets[0]]} et ${ARTICLE[f.targets[1]]}.`;
      const l = lineTactic(r, to);
      if (l) return l.kind === 'pin' ? `Tu permets un clouage ${DE[l.front]} sur ${ARTICLE[l.back]}.` : `Tu permets une enfilade sur ${ARTICLE[l.front]}.`;
      const d = discovered(after.fen(), reply);
      if (d) return `Tu permets une attaque à la découverte sur ${ARTICLE[d.target]}.`;
    }
  }
  const hanging = hangingPiece(after, color);
  if (hanging && hanging.gain >= 1) return `Tu laisses ${ARTICLE[hanging.type]} en ${hanging.square} en prise.`;
  const loss = -materialAfterLine(after.fen(), input.replyPv, color, 6);
  if (loss >= 1) return `Tu perds ${materialWords(loss)}.`;
  if (kingExposed(input.fenBefore, input.playedUci)) return "Tu affaiblis l'abri de ton roi.";
  const before = new Chess(input.fenBefore);
  const piece = before.get(input.playedUci.slice(0, 2) as Square);
  const fromRank = Number(input.playedUci[1]);
  const toRank = Number(input.playedUci[3]);
  const best = input.bestPv[0];
  const bestPiece = best ? before.get(best.slice(0, 2) as Square) : null;
  const bestCastles = bestPiece?.type === 'k' && best && Math.abs(best.charCodeAt(2) - best.charCodeAt(0)) === 2;
  if (bestCastles && before.moveNumber() >= 8) return 'Ton roi reste au centre.';
  if (before.moveNumber() <= 12 && bestPiece && (bestPiece.type === 'n' || bestPiece.type === 'b') && best[1] === (color === 'w' ? '1' : '8') && piece?.type !== 'n' && piece?.type !== 'b')
    return 'Tu retardes ton développement.';
  if (piece && piece.type !== 'p' && piece.type !== 'k' && (color === 'w' ? toRank < fromRank : toRank > fromRank)) return `Ce recul ${DE[piece.type]} est passif.`;
  return null;
}

/** Ampleur en mots simples, du point de vue du joueur. */
function swingWords(input: ExplainInput, color: Color): string {
  const before = winPercentFor(input.bestScore, color);
  const after = winPercentFor(input.scoreAfter, color);
  if (before >= 60 && after < 40) return "L'avantage passe à l'adversaire.";
  if (before >= 60 && after < 60) return 'Ton avantage disparaît.';
  if (before >= 40 && after < 40) return 'Tu passes en position difficile.';
  if (after >= 60) return 'Tu gardes l\'avantage, mais moins.';
  if (after >= 40) return 'La partie reste égale.';
  return 'Ta position empire.';
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export interface Explanation {
  /** Pour l'écran : 2 phrases au plus. */
  text: string;
  /** Pour la narration : 15 mots au plus, sans centipions. */
  spoken: string;
}

const GOOD_EXPLAINED: Label[] = ['brilliant', 'great', 'excellent'];

const memo = new Map<string, Explanation | null>();

/** Explication d'un coup (mémorisée : la revue reconstruit l'analyse après chaque position). */
export function explainMove(input: ExplainInput): Explanation | null {
  const key = JSON.stringify(input);
  if (memo.has(key)) return memo.get(key)!;
  const e = computeExplanation(input);
  if (memo.size > 4000) memo.clear();
  memo.set(key, e);
  return e;
}

function computeExplanation(input: ExplainInput): Explanation | null {
  const before = new Chess(input.fenBefore);
  const color = before.turn();
  if (GOOD_EXPLAINED.includes(input.label)) {
    const idea = moveIdea(input.fenBefore, [input.playedUci, ...input.replyPv]);
    if (!idea) return null;
    const sentence = input.label === 'brilliant' ? `Sacrifice : ce coup ${idea}.` : `Ce coup ${idea}.`;
    return { text: sentence, spoken: sentence };
  }
  if (!['inaccuracy', 'mistake', 'blunder', 'miss'].includes(input.label)) return null;
  const best = input.bestPv[0];
  let bestSan = '';
  try {
    bestSan = best ? frSan(new Chess(input.fenBefore).move({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] }).san) : '';
  } catch {
    bestSan = '';
  }
  const idea = best ? moveIdea(input.fenBefore, input.bestPv, input.bestScore) : null;
  const better = bestSan ? `Mieux valait ${bestSan}${idea ? `, qui ${idea}` : ''}.` : '';
  const first = input.label === 'miss' ? "Ton adversaire venait de se tromper." : (concession(input, color) ?? swingWords(input, color));
  const missFirst = input.label === 'miss' && bestSan ? `Il fallait jouer ${bestSan}${idea ? `, qui ${idea}` : ''}.` : better;
  const text = [first, missFirst].filter(Boolean).join(' ');
  // À l'oral : la raison la plus concrète d'abord, 15 mots au plus.
  const candidates = input.label === 'miss' ? [missFirst] : [`${first} ${better}`, better, first];
  const spoken = candidates.find((c) => c && words(c) <= 15) ?? (bestSan ? `Mieux valait ${bestSan}.` : first);
  return { text, spoken };
}

export const PIECE_NAMES_FR = NAME;
