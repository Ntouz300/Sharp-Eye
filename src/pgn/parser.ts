import { Chess, type Move } from 'chess.js';
import type { ImportError, ImportResult, MoveNode, ParsedGame, Shape } from './types';

export const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '½-½', '*']);

/** Décode des octets en texte : UTF-8 si valide, sinon Latin-1 (Windows-1252). */
export function decodeBytes(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(view);
  } catch {
    text = new TextDecoder('windows-1252').decode(view);
  }
  return text.replace(/^\uFEFF/, '');
}

/** Détecte une FEN seule (6 champs, ou 4 au minimum). */
export function looksLikeFen(text: string): boolean {
  const t = text.trim();
  return /^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}\s+[wb](\s+[KQkqA-Ha-h-]+)?(\s+[a-h1-8-]+)?(\s+\d+)?(\s+\d+)?$/.test(t);
}

/** Découpe un texte contenant une ou plusieurs parties en blocs de texte, une partie par bloc. */
export function splitGames(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const games: string[] = [];
  let current: string[] = [];
  let inMoves = false;
  let braceDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (braceDepth === 0 && trimmed.startsWith('[') && /^\[\s*\w+\s+"/.test(trimmed) && inMoves) {
      games.push(current.join('\n'));
      current = [];
      inMoves = false;
    }
    current.push(line);
    if (braceDepth === 0 && /^\[\s*\w+\s+"/.test(trimmed)) continue;
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
    if (trimmed && braceDepth === 0 && !trimmed.startsWith('%')) inMoves = true;
  }
  if (current.join('').trim()) games.push(current.join('\n'));
  return games.filter((g) => g.trim().length > 0);
}

type Token =
  | { t: 'move'; v: string }
  | { t: 'comment'; v: string }
  | { t: 'nag'; v: number }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'result'; v: string };

const SUFFIX_NAGS: Record<string, number> = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };

function tokenize(movetext: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = movetext;
  while (i < s.length) {
    const c = s[i];
    if (c === '{') {
      const end = s.indexOf('}', i + 1);
      const stop = end === -1 ? s.length : end;
      tokens.push({ t: 'comment', v: s.slice(i + 1, stop) });
      i = stop + 1;
    } else if (c === ';') {
      const end = s.indexOf('\n', i);
      const stop = end === -1 ? s.length : end;
      tokens.push({ t: 'comment', v: s.slice(i + 1, stop) });
      i = stop;
    } else if (c === '%' && (i === 0 || s[i - 1] === '\n')) {
      const end = s.indexOf('\n', i);
      i = end === -1 ? s.length : end;
    } else if (c === '(') {
      tokens.push({ t: 'open' });
      i++;
    } else if (c === ')') {
      tokens.push({ t: 'close' });
      i++;
    } else if (c === '$') {
      const m = /^\$(\d+)/.exec(s.slice(i));
      if (m) {
        tokens.push({ t: 'nag', v: Number(m[1]) });
        i += m[0].length;
      } else i++;
    } else if (/\s/.test(c)) {
      i++;
    } else {
      const m = /^[^\s{}();$]+/.exec(s.slice(i));
      const word = m ? m[0] : c;
      i += word.length;
      if (RESULTS.has(word)) {
        tokens.push({ t: 'result', v: word === '½-½' ? '1/2-1/2' : word });
        continue;
      }
      // Supprime numéros de coup (« 12. », « 12... », « 12.e4 »)
      const stripped = word.replace(/^\d+\.+/, '');
      if (!stripped) continue;
      if (/^[!?]+$/.test(stripped)) {
        const nag = SUFFIX_NAGS[stripped];
        if (nag) tokens.push({ t: 'nag', v: nag });
        continue;
      }
      const suffix = /([!?]{1,2})$/.exec(stripped);
      const san = suffix ? stripped.slice(0, -suffix[1].length) : stripped;
      if (san) tokens.push({ t: 'move', v: san });
      if (suffix && SUFFIX_NAGS[suffix[1]]) tokens.push({ t: 'nag', v: SUFFIX_NAGS[suffix[1]] });
    }
  }
  return tokens;
}

const FR_PIECES: Record<string, string> = { R: 'K', D: 'Q', T: 'R', F: 'B', C: 'N' };

/** Normalise un coup écrit à la main (zéros de roque, « : » de prise, « e.p. »…). */
function normalizeSan(raw: string, french: boolean): string {
  let san = raw.replace(/[×:]/g, 'x').replace(/e\.p\.?$/i, '').replace(/[+#]+$/, '');
  san = san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
  if (french) {
    san = san.replace(/^[RDTFC]/, (p) => FR_PIECES[p]).replace(/=?([DTFC])$/, (_m, p: string) => '=' + FR_PIECES[p]);
  }
  // Promotion sans « = » (e8Q)
  san = san.replace(/^([a-h](?:x[a-h])?[18])([QRBN])$/, '$1=$2');
  return san;
}

function isFrench(tokens: Token[]): boolean {
  return tokens.some((t) => t.t === 'move' && (/^[DTFC][a-h1-8x]/.test(t.v) || /=[DTFC]/.test(t.v)));
}

/** Analyse le texte d'un commentaire : horloge, évaluation, cases et flèches, texte libre. */
export function parseCommentCommands(raw: string): {
  text: string;
  clock?: number;
  evalAnnot?: { cp?: number; mate?: number };
  shapes: Shape[];
  engineData?: string;
} {
  let engineData: string | undefined;
  let clock: number | undefined;
  let evalAnnot: { cp?: number; mate?: number } | undefined;
  const shapes: Shape[] = [];
  const text = raw.replace(/\[%(\w+)\s+([^\]]*)\]/g, (_m, cmd: string, arg: string) => {
    const a = arg.trim();
    if (cmd === 'clk') {
      const parts = a.split(':').map(Number);
      if (parts.every((n) => !Number.isNaN(n))) clock = parts.reduce((acc, n) => acc * 60 + n, 0);
    } else if (cmd === 'eval') {
      const v = a.split(',')[0];
      if (v.startsWith('#')) evalAnnot = { mate: Number(v.slice(1)) };
      else if (!Number.isNaN(Number(v))) evalAnnot = { cp: Math.round(Number(v) * 100) };
    } else if (cmd === 'se') {
      engineData = a;
    } else if (cmd === 'csl' || cmd === 'cal') {
      for (const item of a.split(',')) {
        const m = /^([GRYB])([a-h][1-8])([a-h][1-8])?$/.exec(item.trim());
        if (m) shapes.push({ color: m[1] as Shape['color'], from: m[2], to: m[3] });
      }
    }
    return '';
  });
  return { text: text.replace(/\s+/g, ' ').trim(), clock, evalAnnot, shapes, engineData };
}

class GameError extends Error {
  constructor(
    message: string,
    public move?: string,
  ) {
    super(message);
  }
}

function moveLabel(chess: Chess, raw: string): string {
  const n = chess.moveNumber();
  return chess.turn() === 'w' ? `${n}. ${raw}` : `${n}... ${raw}`;
}

function toNode(chess: Chess, fenBefore: string, m: Move): MoveNode {
  const parts = fenBefore.split(' ');
  return {
    san: m.san,
    uci: m.from + m.to + (m.promotion ?? ''),
    moveNumber: Number(parts[5] ?? 1),
    color: m.color,
    fenBefore,
    fenAfter: chess.fen(),
    nags: [],
    shapes: [],
    variations: [],
  };
}

function applyComment(target: MoveNode, raw: string) {
  const c = parseCommentCommands(raw);
  if (c.clock !== undefined) target.clock = c.clock;
  if (c.evalAnnot) target.evalAnnot = c.evalAnnot;
  if (c.engineData) target.engineData = c.engineData;
  target.shapes.push(...c.shapes);
  if (c.text) target.comment = target.comment ? `${target.comment} ${c.text}` : c.text;
}

/** Analyse une ligne (principale ou variante) à partir de la position fenStart. */
function parseLine(
  tokens: Token[],
  pos: { i: number },
  fenStart: string,
  french: boolean,
  warnings: string[],
  isMain: boolean,
  pre: { comment?: string; engineData?: string },
): MoveNode[] {
  const chess = new Chess(fenStart);
  const line: MoveNode[] = [];
  while (pos.i < tokens.length) {
    const tok = tokens[pos.i];
    if (tok.t === 'close') {
      if (isMain) {
        pos.i++;
        continue;
      }
      return line;
    }
    pos.i++;
    if (tok.t === 'result') {
      if (isMain) return line;
      continue;
    }
    if (tok.t === 'comment') {
      const last = line[line.length - 1];
      if (last) applyComment(last, tok.v);
      else {
        const c = parseCommentCommands(tok.v);
        if (c.engineData) pre.engineData = c.engineData;
        if (c.text) pre.comment = pre.comment ? `${pre.comment} ${c.text}` : c.text;
      }
      continue;
    }
    if (tok.t === 'nag') {
      const last = line[line.length - 1];
      if (last) last.nags.push(tok.v);
      continue;
    }
    if (tok.t === 'open') {
      const last = line[line.length - 1];
      if (!last) {
        skipVariation(tokens, pos);
        continue;
      }
      const start = pos.i;
      try {
        const variation = parseLine(tokens, pos, last.fenBefore, french, warnings, false, {});
        if (variation.length) last.variations.push(variation);
      } catch (e) {
        pos.i = start;
        skipVariation(tokens, pos);
        warnings.push(`Variante ignorée après ${last.moveNumber}${last.color === 'w' ? '.' : '...'} ${last.san} : ${(e as Error).message}`);
        continue;
      }
      if (tokens[pos.i]?.t === 'close') pos.i++;
      continue;
    }
    // Coup
    const raw = tok.v;
    const fenBefore = chess.fen();
    let move: Move | null = null;
    for (const candidate of [normalizeSan(raw, french), normalizeSan(raw, !french)]) {
      try {
        move = chess.move(candidate, { strict: false });
        if (move) break;
      } catch {
        move = null;
      }
    }
    if (!move) throw new GameError(`coup illégal ou illisible « ${raw} »`, moveLabel(chess, raw));
    line.push(toNode(chess, fenBefore, move));
  }
  if (!isMain) throw new GameError('variante non fermée');
  return line;
}

function skipVariation(tokens: Token[], pos: { i: number }) {
  let depth = 1;
  while (pos.i < tokens.length && depth > 0) {
    const t = tokens[pos.i++];
    if (t.t === 'open') depth++;
    else if (t.t === 'close') depth--;
  }
}

/** Analyse le texte d'une seule partie (balises facultatives). */
export function parseGame(text: string): ParsedGame {
  const headers: Record<string, string> = {};
  const tagRe = /^\s*\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let idx = 0;
  for (; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!line.trim()) continue;
    const m = tagRe.exec(line);
    if (!m) break;
    headers[m[1]] = m[2].replace(/\\(["\\])/g, '$1');
  }
  const movetext = lines.slice(idx).join('\n');

  if (!Object.keys(headers).length && looksLikeFen(movetext)) {
    return { headers: { SetUp: '1', FEN: movetext.trim() }, startFen: new Chess(movetext.trim()).fen(), moves: [], result: '*', warnings: [] };
  }

  let startFen = STANDARD_FEN;
  if (headers.FEN) {
    try {
      startFen = new Chess(headers.FEN).fen();
    } catch {
      throw new GameError(`position de départ (FEN) invalide : ${headers.FEN}`);
    }
  }
  if (headers.Variant && /960|fischer/i.test(headers.Variant) && !headers.FEN) {
    throw new GameError('partie Chess960 sans position de départ (balise FEN manquante)');
  }

  const tokens = tokenize(movetext);
  const french = isFrench(tokens);
  const warnings: string[] = [];
  const pre: { comment?: string; engineData?: string } = {};
  const pos = { i: 0 };
  const moves = parseLine(tokens, pos, startFen, french, warnings, true, pre);
  const resultTok = tokens.find((t) => t.t === 'result') as { v: string } | undefined;
  const result = headers.Result && RESULTS.has(headers.Result) ? headers.Result : (resultTok?.v ?? '*');
  return { headers, startFen, moves, result, preComment: pre.comment, startEngineData: pre.engineData, warnings };
}

function gameLabel(text: string, index: number): string {
  const w = /\[White\s+"([^"]*)"/.exec(text)?.[1];
  const b = /\[Black\s+"([^"]*)"/.exec(text)?.[1];
  return w || b ? `${w ?? '?'} – ${b ?? '?'}` : `Partie ${index}`;
}

/** Importe un texte PGN (une ou plusieurs parties), une liste de coups ou une FEN. Ne lève jamais d'exception. */
export function importPgn(text: string): ImportResult {
  const games: ParsedGame[] = [];
  const errors: ImportError[] = [];
  const chunks = splitGames(text);
  chunks.forEach((chunk, k) => {
    try {
      const g = parseGame(chunk);
      g.source = chunk.trim();
      if (!g.moves.length && !g.headers.FEN) {
        errors.push({ gameIndex: k + 1, label: gameLabel(chunk, k + 1), message: 'aucun coup trouvé' });
        return;
      }
      games.push(g);
    } catch (e) {
      const err = e as GameError;
      errors.push({ gameIndex: k + 1, label: gameLabel(chunk, k + 1), move: err.move, message: err.message || String(e) });
    }
  });
  if (!chunks.length) errors.push({ gameIndex: 1, label: 'Texte', message: 'texte vide' });
  return { games, errors };
}

/** Durée de la cadence en secondes (« 180+2 » → 180, incrément 2). */
export function parseTimeControl(tc: string | undefined): { base: number; inc: number } | null {
  if (!tc || tc === '-' || tc === '?') return null;
  const m = /^(\d+)(?:\+(\d+))?/.exec(tc);
  if (!m) {
    const d = /^1\/(\d+)/.exec(tc);
    return d ? { base: Number(d[1]), inc: 0 } : null;
  }
  return { base: Number(m[1]), inc: Number(m[2] ?? 0) };
}

export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence' | 'unknown';

export function speedOf(tc: string | undefined): Speed {
  if (tc?.startsWith('1/')) return 'correspondence';
  const t = parseTimeControl(tc);
  if (!t) return 'unknown';
  const total = t.base + 40 * t.inc;
  if (total < 180) return 'bullet';
  if (total < 480) return 'blitz';
  if (total < 1500) return 'rapid';
  return 'classical';
}

export const SPEED_LABEL: Record<Speed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapide',
  classical: 'Classique',
  correspondence: 'Par correspondance',
  unknown: 'Cadence inconnue',
};
