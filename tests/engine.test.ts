import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeGame } from '../src/analysis/analyzeGame';
import { REVIEW_LEVELS } from '../src/analysis/config';
import type { Engine } from '../src/engine/types';
import { importPgn } from '../src/pgn/parser';
import { createNodeEngine } from './nodeEngine';

let engine: Engine;
beforeAll(async () => {
  engine = await createNodeEngine();
  // Profondeur réduite pour garder des tests rapides ; le code est identique aux niveaux réels.
  (REVIEW_LEVELS as Record<string, { depth: number }>).quick.depth = 10;
}, 30000);

const opera = importPgn(readFileSync(new URL('./fixtures/chesscom-opera.pgn', import.meta.url), 'utf8')).games[0];

describe('revue avec Stockfish', () => {
  it('chaque coup porte exactement une étiquette, comptée correctement', async () => {
    const a = await analyzeGame(opera, { level: 'quick', engine });
    expect(a.moves).toHaveLength(opera.moves.length);
    const total = (s: typeof a.white) => Object.values(s.counts).reduce((x, y) => x + (y ?? 0), 0);
    expect(total(a.white)).toBe(17);
    expect(total(a.black)).toBe(16);
    expect(a.moves.slice(0, 4).every((m) => m.label === 'book')).toBe(true);
    expect(a.opening?.eco).toBe('C41');
    expect(a.white.accuracy).toBeGreaterThan(a.black.accuracy!);
  }, 120000);

  it('deux analyses identiques donnent les mêmes précisions et étiquettes', async () => {
    const a = await analyzeGame(opera, { level: 'quick', engine });
    const b = await analyzeGame(opera, { level: 'quick', engine });
    expect(b.white.accuracy!.toFixed(1)).toBe(a.white.accuracy!.toFixed(1));
    expect(b.black.accuracy!.toFixed(1)).toBe(a.black.accuracy!.toFixed(1));
    expect(b.moves.map((m) => m.label)).toEqual(a.moves.map((m) => m.label));
  }, 120000);

  it('un sacrifice de dame menant au mat est Brillant', async () => {
    const g = importPgn('[SetUp "1"]\n[FEN "5r1k/5ppp/7N/q2Q4/8/8/5PPP/6K1 b - - 0 1"]\n\n1... f5 2. Qg8+ Rxg8 3. Nf7# 1-0').games[0];
    const a = await analyzeGame(g, { level: 'quick', engine });
    expect(a.moves[0].label).toBe('blunder');
    expect(a.moves[1].label).toBe('brilliant');
    expect(a.moves[2].label).toBe('forced');
  }, 60000);

  it('laisser filer une pièce offerte après une gaffe est une Occasion manquée', async () => {
    // 1... Qh4?? offre la dame au cavalier f3 ; 3. Cc3 ne la prend pas.
    const g = importPgn('[SetUp "1"]\n[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"]\n\n2... Qh4 3. Nc3 *').games[0];
    const a = await analyzeGame(g, { level: 'quick', engine });
    expect(a.moves[0].label).toBe('blunder');
    expect(a.moves[1].label).toBe('miss');
  }, 60000);
});
