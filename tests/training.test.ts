import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { glicko, INTERVALS, myColors, recordAttempt, getProfile } from '../src/features/puzzles/puzzles';
import { gameStats, repertoire, weaknesses } from '../src/features/stats/stats';
import { exportBackup, importBackup } from '../src/storage/backup';
import { db, type StoredGame, type StoredPuzzle } from '../src/storage/db';
import { importPgn } from '../src/pgn/parser';

const DAY = 24 * 3600 * 1000;

function puzzle(over: Partial<StoredPuzzle> = {}): StoredPuzzle {
  return {
    id: 'g1|10',
    gameId: 'g1',
    moveIndex: 10,
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    solution: ['e7e5'],
    played: 'a7a6',
    label: 'blunder',
    theme: 'Fourchettes',
    rating: 1500,
    due: 0,
    stage: 0,
    attempts: 0,
    successes: 0,
    createdAt: 0,
    ...over,
  };
}

function game(id: string, white: string, black: string, result: string, firstMoves: string): StoredGame {
  return { id, source: '', white, black, result, firstMoves, plies: 40, movesKey: id, importedAt: 0, date: '2026.10.01' } as StoredGame;
}

describe('classement des puzzles', () => {
  it('une réussite fait monter le classement, un échec le fait baisser', () => {
    const up = glicko(1500, 350, 1500, 1);
    const down = glicko(1500, 350, 1500, 0);
    expect(up.rating).toBeGreaterThan(1500);
    expect(down.rating).toBeLessThan(1500);
    expect(up.rating - 1500).toBeCloseTo(1500 - down.rating, 0);
    expect(up.rd).toBeLessThan(350);
  });

  it('battre un puzzle plus difficile rapporte davantage', () => {
    expect(glicko(1500, 200, 1900, 1).rating).toBeGreaterThan(glicko(1500, 200, 1100, 1).rating);
  });
});

describe('révision espacée', () => {
  it('suit les intervalles 1, 3, 7, 21 jours et revient au lendemain après un échec', async () => {
    await db.puzzles.clear();
    await db.kv.clear();
    const now = new Date(2026, 9, 10, 15).getTime();
    const today = new Date(2026, 9, 10).getTime();
    let p = puzzle();
    for (let i = 0; i < INTERVALS.length; i++) {
      p = (await recordAttempt(p, true, now)).puzzle;
      expect(p.stage).toBe(i + 1);
      expect(p.due).toBe(today + INTERVALS[i] * DAY);
    }
    // Plafonné au dernier intervalle.
    p = (await recordAttempt(p, true, now)).puzzle;
    expect(p.due).toBe(today + 21 * DAY);
    p = (await recordAttempt(p, false, now)).puzzle;
    expect(p.stage).toBe(0);
    expect(p.due).toBe(today + DAY);
    expect(p.attempts).toBe(6);
    expect(p.successes).toBe(5);
  });

  it('compte la série de jours consécutifs', async () => {
    await db.kv.clear();
    const d1 = new Date(2026, 9, 10, 12).getTime();
    await recordAttempt(puzzle(), true, d1);
    await recordAttempt(puzzle(), true, d1 + DAY);
    expect((await getProfile()).streak).toBe(2);
    await recordAttempt(puzzle(), true, d1 + 3 * DAY);
    expect((await getProfile()).streak).toBe(1);
  });
});

describe('pseudos', () => {
  it('reconnaît le camp de l’utilisateur sans tenir compte de la casse', () => {
    const g = importPgn('[White "Antoine"]\n[Black "Rival"]\n\n1. e4 e5 *').games[0];
    expect(myColors(g, ['antoine'])).toEqual(['w']);
    expect(myColors(g, ['RIVAL', 'x'])).toEqual(['b']);
    expect(myColors(g, [])).toEqual(['w', 'b']);
    expect(myColors(g, ['inconnu'])).toEqual(['w', 'b']);
  });
});

describe('statistiques et répertoire', () => {
  const games = [
    game('a', 'moi', 'x', '1-0', 'e4 e5 Nf3 Nc6'),
    game('b', 'moi', 'y', '0-1', 'e4 c5 Nf3'),
    game('c', 'z', 'moi', '1/2-1/2', 'd4 d5'),
    game('d', 'u', 'v', '1-0', 'c4'),
  ];
  const stats = gameStats(games, new Map(), ['MOI']);

  it('ne garde que les parties de l’utilisateur et calcule son score', () => {
    expect(stats.map((s) => [s.id, s.color, s.score])).toEqual([
      ['a', 'w', 1],
      ['b', 'w', 0],
      ['c', 'b', 0.5],
    ]);
  });

  it('construit l’arbre des ouvertures par couleur', () => {
    const w = repertoire(stats, 'w');
    expect(w.games).toBe(2);
    expect(w.children[0].san).toBe('e4');
    expect(w.children[0].games).toBe(2);
    expect(w.children[0].score).toBe(0.5);
    expect(w.children[0].children.map((c) => c.san).sort()).toEqual(['c5', 'e5']);
    expect(repertoire(stats, 'b').children[0].san).toBe('d4');
  });

  it('classe les faiblesses par thème', () => {
    const w = weaknesses([puzzle({ theme: 'Mats', attempts: 2, successes: 0 }), puzzle({ theme: 'Mats' }), puzzle({ theme: 'Finales', attempts: 1, successes: 1 })]);
    expect(w[0]).toEqual({ theme: 'Mats', count: 2, failed: 2 });
    expect(w[1]).toEqual({ theme: 'Finales', count: 1, failed: 0 });
  });
});

describe('sauvegarde JSON', () => {
  it('exporte puis restaure parties, puzzles et réglages', async () => {
    await db.games.clear();
    await db.puzzles.clear();
    await db.games.put(game('a', 'moi', 'x', '1-0', 'e4'));
    await db.puzzles.put(puzzle());
    const blob = await exportBackup({ theme: 'neon' });
    const text = await blob.text();
    await db.games.clear();
    await db.puzzles.clear();
    const r = await importBackup(text);
    expect(r.games).toBe(1);
    expect(r.puzzles).toBe(1);
    expect(r.settings).toEqual({ theme: 'neon' });
    expect((await db.games.get('a'))?.white).toBe('moi');
  });

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    await expect(importBackup('{"hello":1}')).rejects.toThrow(/sauvegarde/);
    await expect(importBackup('pas du json')).rejects.toThrow(/illisible/);
  });
});
