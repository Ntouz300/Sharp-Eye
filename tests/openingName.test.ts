import { describe, expect, it } from 'vitest';
import { judgeTried } from '../src/features/review/explore';
import { openingsByPly } from '../src/analysis/openings';
import { importPgn } from '../src/pgn/parser';
import { openingLine } from '../src/features/review/MoveDetail';
import { narrationText } from '../src/features/review/narration';

const game = (moves: string) => importPgn(`[White "A"]\n[Black "B"]\n\n${moves} *`).games[0];

describe('ouverture précise dans les commentaires', () => {
  it('nomme la variante la plus précise atteinte', () => {
    const caro = game('1. e4 c6 2. Bc4 d5');
    const o = openingsByPly(caro.startFen, caro.moves);
    expect(o[1]?.name).toBe('Caro-Kann Defense');
    expect(o[2]?.name).toBe('Caro-Kann Defense: Hillbilly Attack');
    expect(openingLine(o[2], 'book', false)).toBe('Caro-Kann : attaque Hillbilly (B10)');
    const vienna = game('1. e4 e5 2. Nc3 Nc6 3. f4');
    const v = openingsByPly(vienna.startFen, vienna.moves);
    expect(openingLine(v[4], 'book', false)).toBe('Gambit viennois : avec défense Max Lange (C25)');
  });

  it('annonce la sortie de la théorie, puis plus rien', () => {
    const g = game('1. e4 c6 2. Bc4 d5');
    const o = openingsByPly(g.startFen, g.moves);
    expect(openingLine(o[3], 'inaccuracy', true)).toMatch(/^Sortie de la théorie : Caro-Kann/);
    expect(openingLine(o[3], 'good', false)).toBeNull();
  });

  it('la narration dit la variante quand elle change', () => {
    const g = game('1. e4 c6 2. Bc4');
    expect(narrationText(g.moves[2], undefined, true, 'Caro-Kann : attaque Hillbilly')).toBe('Caro-Kann, attaque Hillbilly. Fou c4.');
  });
});

describe('coups essayés en exploration', () => {
  const ev = (score: { cp?: number; mate?: number }, pv: string[], second?: { cp?: number }) => ({
    fen: '',
    depth: 14,
    lines: [{ multipv: 1, depth: 14, score, pv }, ...(second ? [{ multipv: 2, depth: 14, score: second, pv: ['a2a3'] }] : [])],
  });
  const start = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  it('classe un coup essayé comme un coup de la partie', () => {
    expect(judgeTried(start, 'g1f3', ev({ cp: 30 }, ['g1f3'], { cp: 25 }), ev({ cp: 30 }, ['b8c6']))).toBe('best');
    expect(judgeTried(start, 'd1h5', ev({ cp: 30 }, ['g1f3'], { cp: 25 }), ev({ cp: -350 }, ['g8f6']))).toBe('blunder');
    expect(judgeTried(start, 'a2a3', ev({ cp: 30 }, ['g1f3'], { cp: 25 }), ev({ cp: 0 }, ['g8f6']))).toBe('good');
  });
});
