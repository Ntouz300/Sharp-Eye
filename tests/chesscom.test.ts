import 'fake-indexeddb/auto';
import { Chess } from 'chess.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const engineCalls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/engine/stockfish', () => ({
  getEngine: () => {
    engineCalls.n++;
    throw new Error('moteur interdit pendant la synchro');
  },
  getOpponentEngine: () => {
    engineCalls.n++;
    throw new Error('moteur interdit');
  },
}));

import { AccountNotFound, fetchProfile, getAccount, linkAccount, syncChessCom, type FetchFn } from '../src/features/account/chesscom';
import { importPgn } from '../src/pgn/parser';
import { db } from '../src/storage/db';
import { saveGames } from '../src/storage/games';

/** Parties aléatoires mais reproductibles (graine), au format de l'API chess.com. */
function makeGame(seed: number, month: string) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const c = new Chess();
  for (let i = 0; i < 16 && !c.isGameOver(); i++) {
    const moves = c.moves();
    c.move(moves[Math.floor(rnd() * moves.length)]);
  }
  const url = `https://www.chess.com/game/live/${1000 + seed}`;
  c.header('Event', 'Live Chess', 'Site', 'Chess.com', 'White', seed % 2 ? 'antoine' : `rival${seed}`, 'Black', seed % 2 ? `rival${seed}` : 'antoine', 'Result', '*', 'Link', url, 'Date', `${month.replace('-', '.')}.10`);
  return { url, uuid: `u${seed}`, pgn: c.pgn(), rules: 'chess', end_time: 1700000000 + seed };
}

const months = ['2026-08', '2026-09', '2026-10'];
const byMonth: Record<string, ReturnType<typeof makeGame>[]> = {};
months.forEach((m, k) => (byMonth[m] = Array.from({ length: 40 }, (_, i) => makeGame(k * 40 + i + 1, m))));

function api(opts: { fail429Once?: boolean } = {}) {
  const calls: string[] = [];
  let failed = false;
  const fetchFn: FetchFn = async (url) => {
    calls.push(url);
    const json = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
    if (opts.fail429Once && !failed) {
      failed = true;
      return json({}, 429);
    }
    if (url.endsWith('/player/antoine')) return json({ username: 'Antoine', name: 'Antoine G.', avatar: 'https://img/a.png', country: 'https://api.chess.com/pub/country/CA' });
    if (url.endsWith('/player/antoine/stats')) return json({ chess_rapid: { last: { rating: 1234 } }, chess_blitz: { last: { rating: 1100 } } });
    if (url.endsWith('/games/archives')) return json({ archives: months.map((m) => `https://api.chess.com/pub/player/antoine/games/${m.replace('-', '/')}`) });
    const m = /games\/(\d{4})\/(\d{2})$/.exec(url);
    if (m) return json({ games: byMonth[`${m[1]}-${m[2]}`] });
    return json({}, 404);
  };
  return { fetchFn, calls };
}
const noSleep = async () => undefined;
const now = new Date(2026, 9, 31);

describe('compte chess.com', () => {
  beforeEach(async () => {
    await db.games.clear();
    await db.kv.clear();
    engineCalls.n = 0;
  });

  it('affiche le profil d’un pseudo valide', async () => {
    const p = await fetchProfile('Antoine', api().fetchFn, noSleep);
    expect(p).toMatchObject({ username: 'Antoine', avatar: 'https://img/a.png', country: 'CA', ratings: { rapid: 1234, blitz: 1100 } });
  });

  it('signale un pseudo inconnu sans planter', async () => {
    await expect(fetchProfile('personne', api().fetchFn, noSleep)).rejects.toBeInstanceOf(AccountNotFound);
    await expect(fetchProfile('personne', api().fetchFn, noSleep)).rejects.toThrow('Compte introuvable');
  });

  it('réessaie après une réponse 429', async () => {
    const a = api({ fail429Once: true });
    const p = await fetchProfile('antoine', a.fetchFn, noSleep);
    expect(p.username).toBe('Antoine');
    expect(a.calls[0]).toBe(a.calls[1]);
  });

  it('importe 120 parties sans doublon et sans lancer le moteur', async () => {
    const acc = await linkAccount(await fetchProfile('antoine', api().fetchFn, noSleep));
    // Une partie déjà collée à la main en PGN.
    await saveGames(importPgn(byMonth['2026-09'][3].pgn).games);
    const a = api();
    const r = await syncChessCom(acc, { fetchFn: a.fetchFn, sleep: noSleep, now });
    expect(await db.games.count()).toBe(120);
    expect(r.added).toBe(119);
    expect((await db.games.toArray()).every((g) => g.origin === 'chesscom' && !g.accuracyWhite)).toBe(true);
    // Les mois les plus récents d'abord.
    expect(a.calls.filter((c) => /\d{4}\/\d{2}$/.test(c)).map((c) => c.slice(-7))).toEqual(['2026/10', '2026/09', '2026/08']);
    expect(engineCalls.n).toBe(0);
    expect(await db.analyses.count()).toBe(0);

    // Deuxième synchro : rien de nouveau, seul le mois courant est relu.
    const b = api();
    const r2 = await syncChessCom((await getAccount())!, { fetchFn: b.fetchFn, sleep: noSleep, now });
    expect(r2.added).toBe(0);
    expect(await db.games.count()).toBe(120);
    expect(b.calls.filter((c) => /\d{4}\/\d{2}$/.test(c)).map((c) => c.slice(-7))).toEqual(['2026/10']);
    expect(engineCalls.n).toBe(0);
  });
});
