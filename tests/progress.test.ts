import { describe, expect, it } from 'vitest';
import { badges, dailyPuzzle, monthReport, months } from '../src/features/progress/achievements';
import type { GameStat } from '../src/features/stats/stats';
import type { StoredPuzzle } from '../src/storage/db';
import { spokenSan } from '../src/ui/speech';

const stat = (id: string, date: string, score: number, accuracy?: number, counts = {}, firstMoves = ['e4', 'e5']): GameStat =>
  ({ id, date: new Date(date).getTime(), color: 'w', opponent: 'x', speed: 'rapid', score, accuracy, counts, lostOnTime: false, firstMoves, hastyErrors: 0 }) as GameStat;

describe('narration', () => {
  it('lit les coups en français', () => {
    expect(spokenSan('Nf3')).toBe('Cavalier f3');
    expect(spokenSan('Bxf7+')).toBe('Fou prend f7, échec');
    expect(spokenSan('exd5')).toBe('pion e prend d5');
    expect(spokenSan('e4')).toBe('pion e4');
    expect(spokenSan('O-O-O')).toBe('grand roque');
    expect(spokenSan('e8=Q#')).toBe('pion e8 promotion en dame, mat');
    expect(spokenSan('Rad1')).toBe('Tour a d1');
  });
});

describe('défi du jour', () => {
  const puzzles = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, rating: 1000 + i * 20 }) as StoredPuzzle);
  it('reste le même toute la journée et change d’un jour à l’autre', () => {
    expect(dailyPuzzle(puzzles, '2026-10-31')).toBe(dailyPuzzle(puzzles, '2026-10-31'));
    const picks = new Set(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => dailyPuzzle(puzzles, d)!.id));
    expect(picks.size).toBeGreaterThan(1);
  });
  it('choisit parmi les plus difficiles', () => {
    expect(dailyPuzzle(puzzles, '2026-10-31')!.rating).toBeGreaterThanOrEqual(1300);
    expect(dailyPuzzle([], '2026-10-31')).toBeUndefined();
  });
});

describe('bilan du mois et badges', () => {
  const stats = [
    stat('a', '2026-09-10', 1, 70),
    stat('b', '2026-10-02', 1, 92, { brilliant: 1 }),
    stat('c', '2026-10-15', 0, 80, { blunder: 2 }, ['d4', 'd5']),
    stat('d', '2026-10-20', 0.5),
  ];
  it('résume le mois et compare au précédent', () => {
    const r = monthReport(stats, '2026-10');
    expect([r.games, r.wins, r.draws, r.losses]).toEqual([3, 1, 1, 1]);
    expect(r.accuracy).toBe(86);
    expect(r.previousAccuracy).toBe(70);
    expect(r.blundersPerGame).toBe(1);
    expect(r.bestGame?.id).toBe('b');
    expect(r.topOpening).toEqual({ moves: 'e4 e5', games: 2 });
    expect(months(stats)).toEqual(['2026-10', '2026-09']);
  });
  it('attribue les badges mérités', () => {
    const list = badges({ stats, puzzles: [], puzzleRating: 1500, streak: 3, dailyDone: 0 });
    const got = (id: string) => list.find((b) => b.id === id)!;
    expect(got('first-review').earned).toBe(true);
    expect(got('accuracy-90').earned).toBe(true);
    expect(got('brilliant').earned).toBe(true);
    expect(got('ten-reviews').earned).toBe(false);
    expect(got('ten-reviews').progress).toBeCloseTo(0.3);
    expect(got('streak-7').progress).toBeCloseTo(3 / 7);
  });
});
