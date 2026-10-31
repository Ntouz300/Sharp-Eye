import { describe, expect, it } from 'vitest';
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
