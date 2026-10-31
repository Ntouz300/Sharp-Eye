import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBytes, importPgn, parseCommentCommands, speedOf } from '../src/pgn/parser';
import { syntheticChessComGame } from './generate';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

describe('import PGN', () => {
  it('importe un export chess.com avec horloges, ECO et Termination', () => {
    const { games, errors } = importPgn(decodeBytes(fixture('chesscom-opera.pgn')));
    expect(errors).toEqual([]);
    expect(games).toHaveLength(1);
    const g = games[0];
    expect(g.headers.White).toBe('Antoine_Test');
    expect(g.headers.WhiteElo).toBe('1432');
    expect(g.headers.ECO).toBe('C41');
    expect(g.headers.Termination).toContain('mat');
    expect(g.moves).toHaveLength(33);
    expect(g.moves[0].clock).toBeCloseTo(598.1, 1);
    expect(g.moves[32].san).toBe('Rd8#');
    expect(g.result).toBe('1-0');
    expect(speedOf(g.headers.TimeControl)).toBe('rapid');
  });

  it('gère commentaires, variantes imbriquées, NAG, %eval, %csl et %cal', () => {
    const { games, errors } = importPgn(decodeBytes(fixture('lichess-annotated.pgn')));
    expect(errors).toEqual([]);
    const g = games[0];
    expect(g.preComment).toBe('Partie commentée');
    expect(g.moves[0].evalAnnot).toEqual({ cp: 30 });
    const exd5 = g.moves[2];
    expect(exd5.nags).toContain(1);
    expect(exd5.comment).toBe('Bien vu');
    expect(exd5.shapes).toEqual([
      { color: 'G', from: 'd5', to: undefined },
      { color: 'G', from: 'd1', to: 'd5' },
      { color: 'R', from: 'b8', to: 'c6' },
    ]);
    expect(exd5.variations).toHaveLength(1);
    expect(exd5.variations[0].map((m) => m.san)).toEqual(['e5', 'c5', 'c3']);
    expect(exd5.variations[0][1].variations[0][0].san).toBe('Bf5');
    expect(g.moves[3].evalAnnot).toEqual({ mate: -3 });
    expect(g.moves[4].nags).toContain(5);
    expect(g.moves[5].nags).toContain(6);
    expect(g.moves[14].nags).toContain(2);
  });

  it('lit une liste de coups en notation française', () => {
    const { games, errors } = importPgn(fixture('french-moves.txt').toString('utf8'));
    expect(errors).toEqual([]);
    expect(games[0].moves.map((m) => m.san).slice(0, 10)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']);
    expect(games[0].moves.at(-1)?.san).toBe('Qc7');
  });

  it('importe les parties valides et signale précisément la partie et le coup fautif', () => {
    const { games, errors } = importPgn(fixture('mixed-errors.pgn').toString('utf8'));
    expect(games.map((g) => g.headers.Event)).toEqual(['Bonne 1', 'Bonne 2']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ gameIndex: 2, label: 'Carla – David', move: '5. Ke3' });
    expect(games[1].startFen).toBe('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1');
  });

  it('décode le Latin-1 et les fins de ligne Windows', () => {
    const { games } = importPgn(decodeBytes(fixture('latin1-crlf.pgn')));
    expect(games[0].headers.White).toBe('François');
    expect(games[0].headers.Black).toBe('Jérôme');
    expect(games[0].moves).toHaveLength(3);
  });

  it('accepte une FEN seule', () => {
    const { games, errors } = importPgn('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    expect(errors).toEqual([]);
    expect(games[0].moves).toHaveLength(0);
    expect(games[0].startFen.startsWith('r1bqkbnr')).toBe(true);
  });

  it('lit les commandes d’horloge au format h:mm:ss.d', () => {
    expect(parseCommentCommands('[%clk 1:02:03.5] texte').clock).toBeCloseTo(3723.5);
    expect(parseCommentCommands('[%clk 1:02:03.5] texte').text).toBe('texte');
  });

  it('importe 500 parties chess.com en moins de 10 s', () => {
    const text = Array.from({ length: 500 }, (_, i) => syntheticChessComGame(i + 1)).join('\n');
    const t = performance.now();
    const { games, errors } = importPgn(text);
    const elapsed = performance.now() - t;
    expect(errors).toEqual([]);
    expect(games).toHaveLength(500);
    console.log(`500 parties importées en ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThan(10000);
  });
});
