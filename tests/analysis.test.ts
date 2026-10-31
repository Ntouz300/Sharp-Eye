import { describe, expect, it } from 'vitest';
import { gameAccuracy } from '../src/analysis/accuracy';
import { classifyMove, type ClassifyInput } from '../src/analysis/classify';
import { isRecapture, sacrificedMaterial } from '../src/analysis/material';
import { estimatePerformance } from '../src/analysis/performance';
import { formatScore, moveAccuracy, winPercentFor, winPercentFromCp, winPercentWhite } from '../src/analysis/winPercent';

describe('Win %', () => {
  // Valeurs calculées à la main : W = 50 + 50 × (2 / (1 + e^(−0,00368208 × cp)) − 1)
  it.each([
    [0, 50],
    [100, 59.1],
    [-100, 40.9],
    [300, 75.1],
    [1000, 97.5],
  ])('cp %d → %d %%', (cp, expected) => {
    expect(winPercentFromCp(cp)).toBeCloseTo(expected, 1);
  });

  it('borne cp à ±1000', () => {
    expect(winPercentFromCp(5000)).toBeCloseTo(winPercentFromCp(1000), 6);
    expect(winPercentFromCp(-5000)).toBeCloseTo(winPercentFromCp(-1000), 6);
  });

  it('mat forcé = 100 % pour le camp qui mate', () => {
    expect(winPercentWhite({ mate: 3 })).toBe(100);
    expect(winPercentWhite({ mate: -2 })).toBe(0);
    expect(winPercentFor({ mate: -2 }, 'b')).toBe(100);
  });

  it('position nulle = 50 % pour les deux camps', () => {
    expect(winPercentFor({ cp: 0 }, 'w')).toBe(50);
    expect(winPercentFor({ cp: 0 }, 'b')).toBe(50);
  });

  it('formate les évaluations à la française', () => {
    expect(formatScore({ cp: 137 })).toBe('+1,4');
    expect(formatScore({ cp: -52 })).toBe('-0,5');
    expect(formatScore({ mate: -3 })).toBe('-M3');
  });
});

describe('Précision', () => {
  // A = 103,1668 × e^(−0,04354 × ΔW) − 3,1669
  it.each([
    [50, 50, 100],
    [60, 50, 63.6],
    [55, 50, 79.8],
    [80, 20, 4.4],
    [100, 0, 0],
  ])('W %d → %d donne %d', (before, after, expected) => {
    expect(moveAccuracy(before, after)).toBeCloseTo(expected, 1);
  });

  it('un coup qui améliore la position vaut 100', () => {
    expect(moveAccuracy(40, 70)).toBe(100);
  });

  it('précision de partie : parfaite = 100, une gaffe fait chuter fortement la moyenne harmonique', () => {
    const wins = [50, 50, 50, 50, 50, 50, 50];
    const colors: ('w' | 'b')[] = ['w', 'b', 'w', 'b', 'w', 'b'];
    expect(gameAccuracy(wins, [100, 100, 100, 100, 100, 100], colors, 'w')).toBeCloseTo(100, 6);
    // Blancs : 100, 100, 10 → pondérée (poids égaux 0,5) = 70, harmonique = 3 / (1/100 + 1/100 + 1/10) = 25 → 47,5
    expect(gameAccuracy(wins, [100, 100, 100, 100, 10, 100], colors, 'w')).toBeCloseTo(47.5, 6);
  });

  it('la performance estimée croît avec la précision', () => {
    expect(estimatePerformance(90, '600')).toBeGreaterThan(estimatePerformance(70, '600'));
    expect(estimatePerformance(80, '60')).toBeGreaterThan(estimatePerformance(80, '600'));
  });
});

const base: ClassifyInput = {
  isBook: false,
  legalMoves: 30,
  playedIsBest: false,
  winBefore: 50,
  winAfter: 50,
  refWin: 50,
  refCp: 0,
  sacrifice: 0,
  isRecapture: false,
};

describe('Classification', () => {
  it('Théorique puis Forcé passent avant tout', () => {
    expect(classifyMove({ ...base, isBook: true, winAfter: 10 })).toBe('book');
    expect(classifyMove({ ...base, legalMoves: 1, winAfter: 10 })).toBe('forced');
  });

  it('seuils de perte de Win %', () => {
    expect(classifyMove({ ...base, winAfter: 48 })).toBe('excellent');
    expect(classifyMove({ ...base, winAfter: 45 })).toBe('good');
    expect(classifyMove({ ...base, winAfter: 40 })).toBe('inaccuracy');
    expect(classifyMove({ ...base, winAfter: 30 })).toBe('mistake');
    expect(classifyMove({ ...base, winAfter: 29.9 })).toBe('blunder');
  });

  it('Meilleur et Coup clé', () => {
    expect(classifyMove({ ...base, playedIsBest: true, winSecondBest: 45 })).toBe('best');
    expect(classifyMove({ ...base, playedIsBest: true, winSecondBest: 40 })).toBe('great');
  });

  it('Brillant : meilleur coup avec sacrifice réel, position non gagnée d’avance', () => {
    const sac = { ...base, playedIsBest: true, winBefore: 100, winAfter: 100, sacrifice: 4, refWin: 5, refCp: -900 };
    expect(classifyMove(sac)).toBe('brilliant');
    expect(classifyMove({ ...sac, isRecapture: true })).toBe('best');
    expect(classifyMove({ ...sac, refWin: 95, refCp: 800 })).toBe('best');
    expect(classifyMove({ ...sac, refWin: 85, refCp: 520 })).toBe('best');
    expect(classifyMove({ ...sac, winAfter: 30, winBefore: 30 })).toBe('best');
  });

  it('Occasion manquée après une gaffe adverse', () => {
    const miss = { ...base, previousLabel: 'blunder' as const, winBeforePrevious: 50, winBefore: 85, winAfter: 50 };
    expect(classifyMove(miss)).toBe('miss');
    // Le joueur gaffe en plus : pas d'« occasion manquée », c'est une gaffe.
    expect(classifyMove({ ...miss, winAfter: 20 })).toBe('blunder');
    // Sans erreur adverse avant : simple gaffe.
    expect(classifyMove({ ...miss, previousLabel: 'good' })).toBe('blunder');
  });

  it('position totalement gagnée : pas de dégradation', () => {
    expect(classifyMove({ ...base, winBefore: 100, winAfter: 98 })).toBe('excellent');
  });
});

describe('Sacrifices et recaptures', () => {
  it('Dg8+ (mat étouffé) sacrifie la dame', () => {
    expect(sacrificedMaterial('5r1k/6pp/7N/q2Q4/8/8/5PPP/6K1 w - - 0 1', 'd5g8')).toBeGreaterThanOrEqual(4);
  });
  it('un échange égal n’est pas un sacrifice', () => {
    // 1. e4 d5 2. exd5 : le pion pris est repris par la dame, perte nette 0.
    expect(sacrificedMaterial('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'e4d5')).toBeLessThanOrEqual(0);
  });
  it('détecte une recapture sur la même case', () => {
    expect(isRecapture('d1d5', true, 'd8d5')).toBe(true);
    expect(isRecapture('d1d5', false, 'd8d5')).toBe(false);
  });
});
