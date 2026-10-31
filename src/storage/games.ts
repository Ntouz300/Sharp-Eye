import type { ParsedGame } from '../pgn/types';
import { db, type GameOrigin, type StoredGame } from './db';

function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

export function movesKeyOf(g: ParsedGame): string {
  return hash(g.startFen + '|' + g.moves.map((m) => m.uci).join(' '));
}

/** Provenance déduite des en-têtes, pour les parties importées à la main. */
export function originOf(g: ParsedGame): GameOrigin {
  const h = g.headers;
  const where = `${h.Link ?? ''} ${h.Site ?? ''}`.toLowerCase();
  if (where.includes('chess.com')) return 'chesscom';
  if (where.includes('lichess.org')) return 'lichess';
  if (!g.moves.length) return 'position';
  return 'pgn';
}

function toStored(g: ParsedGame): StoredGame {
  const h = g.headers;
  const movesKey = movesKeyOf(g);
  return {
    origin: originOf(g),
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: g.source ?? '',
    white: h.White && h.White !== '?' ? h.White : 'Blancs',
    black: h.Black && h.Black !== '?' ? h.Black : 'Noirs',
    whiteElo: h.WhiteElo && h.WhiteElo !== '?' ? h.WhiteElo : undefined,
    blackElo: h.BlackElo && h.BlackElo !== '?' ? h.BlackElo : undefined,
    result: g.result,
    date: h.Date?.replace(/\?\?/g, '01'),
    timeControl: h.TimeControl,
    eco: h.ECO,
    opening: h.Opening ?? h.ECOUrl?.split('/openings/')[1]?.replace(/-/g, ' '),
    link: h.Link ?? (h.Site?.startsWith('http') ? h.Site : undefined),
    plies: g.moves.length,
    firstMoves: g.moves.slice(0, 12).map((m) => m.san).join(' '),
    termination: h.Termination,
    movesKey,
    importedAt: Date.now(),
  };
}

/** Enregistre les parties, en ignorant les doublons (même lien ou même suite de coups). */
export interface SaveOptions {
  origin?: GameOrigin;
  /** Date d'arrivée dans la bibliothèque, par partie (ex. fin de la partie sur chess.com). */
  importedAt?: (g: ParsedGame, i: number) => number | undefined;
  unanalyzable?: (g: ParsedGame, i: number) => boolean;
}

export async function saveGames(games: ParsedGame[], opts: SaveOptions = {}): Promise<{ added: StoredGame[]; duplicates: number }> {
  const existing = await db.games.toArray();
  const keys = new Set(existing.map((g) => g.movesKey));
  const links = new Set(existing.map((g) => g.link).filter(Boolean));
  const added: StoredGame[] = [];
  let duplicates = 0;
  for (const [i, g] of games.entries()) {
    const s = toStored(g);
    if (opts.origin) s.origin = opts.origin;
    if (opts.unanalyzable?.(g, i)) s.unanalyzable = true;
    if (keys.has(s.movesKey) || (s.link && links.has(s.link))) {
      duplicates++;
      // Partie déjà collée à la main : on la rattache au compte synchronisé au lieu de la dupliquer.
      if (opts.origin) {
        const old = existing.find((e) => (s.link && e.link === s.link) || e.movesKey === s.movesKey);
        if (old && old.origin !== opts.origin) await db.games.update(old.id, { origin: opts.origin, link: old.link ?? s.link });
      }
      continue;
    }
    keys.add(s.movesKey);
    if (s.link) links.add(s.link);
    s.importedAt = opts.importedAt?.(g, i) ?? Date.now() + added.length / 1000;
    added.push(s);
  }
  await db.games.bulkAdd(added);
  return { added, duplicates };
}

export async function findDuplicate(g: ParsedGame): Promise<StoredGame | undefined> {
  return db.games.where('movesKey').equals(movesKeyOf(g)).first();
}

export async function deleteGame(id: string) {
  await db.transaction('rw', db.games, db.analyses, async () => {
    await db.games.delete(id);
    await db.analyses.where('gameId').equals(id).delete();
  });
}
