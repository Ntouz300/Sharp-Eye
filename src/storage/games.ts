import type { ParsedGame } from '../pgn/types';
import { db, type StoredGame } from './db';

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

function toStored(g: ParsedGame): StoredGame {
  const h = g.headers;
  const movesKey = movesKeyOf(g);
  return {
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
export async function saveGames(games: ParsedGame[]): Promise<{ added: StoredGame[]; duplicates: number }> {
  const existing = await db.games.toArray();
  const keys = new Set(existing.map((g) => g.movesKey));
  const links = new Set(existing.map((g) => g.link).filter(Boolean));
  const added: StoredGame[] = [];
  let duplicates = 0;
  for (const g of games) {
    const s = toStored(g);
    if (keys.has(s.movesKey) || (s.link && links.has(s.link))) {
      duplicates++;
      continue;
    }
    keys.add(s.movesKey);
    if (s.link) links.add(s.link);
    s.importedAt = Date.now() + added.length / 1000;
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
