import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Engine, PositionEval } from '../src/engine/types';
import { cutLine, fromStored, hint, instruction, isAmbiguous, judge, keyIdea, nextLevel, pickBank, playerMoves, points, START_LEVEL, type Challenge } from '../src/features/puzzles/challenge';
import { migratePuzzles } from '../src/features/puzzles/puzzles';
import { db, type StoredPuzzle } from '../src/storage/db';
import { createNodeEngine } from './nodeEngine';

// Fourchette : Cc7+ attaque le roi et la tour a8.
const FORK = 'r3k3/8/8/3N4/8/8/PP6/4K3 w - - 0 1';

const ev = (fen: string, ...lines: [PositionEval['lines'][0]['score'], string[]][]): PositionEval => ({
  fen,
  depth: 12,
  lines: lines.map(([score, pv], i) => ({ multipv: i + 1, depth: 12, score, pv })),
});

describe('combinaison d’un défi', () => {
  it('s’arrête quand le matériel gagné tient, sur un coup du joueur', () => {
    const cut = cutLine(FORK, ['d5c7', 'e8d7', 'c7a8', 'd7c8', 'a8b6', 'c8b7']);
    expect(cut.line).toEqual(['d5c7', 'e8d7', 'c7a8']);
    expect(cut.goal).toBe('material');
    expect(cut.gain).toBe(5);
    expect(playerMoves(cut.line)).toBe(2);
  });

  it('va jusqu’au mat', () => {
    // Mat du couloir en 2 : De8+ Txe8 Txe8#.
    const fen = 'r5k1/5ppp/8/8/8/8/4QPPP/4R1K1 w - - 0 1';
    const cut = cutLine(fen, ['e2e8', 'a8e8', 'e1e8', 'g8h8']);
    expect(cut.goal).toBe('mate');
    expect(cut.line).toEqual(['e2e8', 'a8e8', 'e1e8']);
  });

  it('ne dépasse pas 5 coups du joueur', () => {
    const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    const pv = ['a1a2', 'e8d8', 'a2a3', 'd8e8', 'a3a4', 'e8d8', 'a4a5', 'd8e8', 'a5a6', 'e8d8', 'a6a7', 'd8e8', 'a7a8'];
    const cut = cutLine(fen, pv);
    expect(playerMoves(cut.line)).toBe(5);
    expect(cut.line.length % 2).toBe(1);
  });

  it('écrit une consigne claire', () => {
    expect(instruction({ fen: FORK, line: ['d5c7', 'e8d7', 'c7a8'], goal: 'material', gain: 5 })).toBe('Les blancs jouent et gagnent une tour en 2 coups.');
    expect(instruction({ fen: '3r2k1/5ppp/8/8/8/8/5PPP/3RR1K1 b - - 0 1', line: ['a', 'b', 'c'], goal: 'mate' })).toBe('Les noirs jouent et matent en 2 coups.');
    expect(instruction({ fen: FORK, line: ['a', 'b', 'c', 'd', 'e'], goal: 'material', gain: 3 })).toBe('Les blancs jouent et gagnent une pièce en 3 coups.');
  });
});

describe('premier coup unique', () => {
  it('écarte une position où le 2e coup gagne aussi', () => {
    expect(isAmbiguous(ev(FORK, [{ cp: 500 }, ['d5c7']], [{ cp: 20 }, ['e1d2']]), 'w')).toBe(false);
    expect(isAmbiguous(ev(FORK, [{ cp: 500 }, ['d5c7']], [{ cp: 450 }, ['d5f6']]), 'w')).toBe(true);
    expect(isAmbiguous(ev(FORK, [{ mate: 3 }, ['d5c7']], [{ mate: 5 }, ['d5f6']]), 'w')).toBe(true);
    // Côté noirs : les scores sont donnés côté blancs.
    expect(isAmbiguous(ev(FORK, [{ cp: -500 }, ['a']], [{ cp: 0 }, ['b']]), 'b')).toBe(false);
  });

  describe('sur des positions connues, avec Stockfish', () => {
    let engine: Engine;
    beforeAll(async () => {
      engine = await createNodeEngine();
    }, 60_000);
    afterAll(() => engine?.stop());

    it('la fourchette du cavalier est unique, une position écrasante ne l’est pas', async () => {
      const fork = await engine.analyze(FORK, 12, 2);
      expect(fork.lines[0].pv[0]).toBe('d5c7');
      expect(isAmbiguous(fork, 'w')).toBe(false);
      const crushing = await engine.analyze('4k3/8/8/8/8/8/8/QQ2K3 w - - 0 1', 12, 2);
      expect(isAmbiguous(crushing, 'w')).toBe(true);
    }, 60_000);
  });
});

describe('jugement d’un coup', () => {
  const ch: Challenge = { id: 't', source: 'bank', fen: FORK, line: ['d5c7', 'e8d7', 'c7a8'], goal: 'material', gain: 5, theme: 'Fourchettes', rating: 1000 };
  const scores: Record<string, PositionEval['lines'][0]['score']> = {};
  const evaluate = async (fen: string): Promise<PositionEval> => ev(fen, [scores[fen.split(' ').slice(0, 2).join(' ')] ?? { cp: 0 }, ['e8d8']]);

  it('accepte la solution', async () => {
    expect(await judge(ch, 0, 'd5c7', evaluate)).toEqual({ kind: 'exact' });
  });

  it('accepte un autre coup à 0,3 pion près et le dit', async () => {
    scores['r3k3/2N5/8/8/8/8/PP6/4K3 b'] = { cp: 500 };
    scores['r3k3/8/8/8/8/2N5/PP6/4K3 b'] = { cp: 480 };
    const v = await judge(ch, 0, 'd5c3', evaluate);
    expect(v.kind).toBe('alternative');
  });

  it('réfute une erreur et explique en une phrase', async () => {
    const v = await judge(ch, 0, 'd5e3', evaluate);
    expect(v.kind).toBe('wrong');
    if (v.kind === 'wrong') {
      expect(v.reply).toEqual(['e8d8']);
      expect(v.reason.split(/\s+/).length).toBeLessThanOrEqual(15);
    }
  });
});

describe('indices, points et niveau', () => {
  const ch: Challenge = { id: 't', source: 'bank', fen: FORK, line: ['d5c7', 'e8d7', 'c7a8'], goal: 'material', gain: 5, theme: 'Fourchettes', rating: 1000 };
  it('donne le thème, puis la pièce, puis la case', () => {
    expect(hint(ch, 0, 1).text).toMatch(/fourchettes/);
    expect(hint(ch, 0, 2)).toEqual({ text: 'Joue le cavalier en d5.', square: 'd5' });
    expect(hint(ch, 0, 3).square).toBe('c7');
  });
  it('enlève un point par indice et par erreur', () => {
    expect(points(0, 0)).toBe(3);
    expect(points(2, 0)).toBe(1);
    expect(points(2, 3)).toBe(0);
  });
  it('3 réussites font monter le niveau, 2 échecs le font baisser', () => {
    let l = START_LEVEL;
    l = nextLevel(nextLevel(nextLevel(l, true), true), true);
    expect(l.rating).toBe(START_LEVEL.rating + 150);
    l = nextLevel(nextLevel(l, false), false);
    expect(l.rating).toBe(START_LEVEL.rating);
    // Une réussite remet le compteur d'échecs à zéro.
    l = nextLevel(nextLevel(nextLevel(l, false), true), false);
    expect(l.rating).toBe(START_LEVEL.rating);
  });
  it('choisit un défi proche du niveau, pas déjà fait', () => {
    const bank = [800, 1200, 1250, 2000].map((rating, i) => ({ ...ch, id: `b${i}`, rating }));
    const pick = pickBank(bank, { rating: 1200, wins: 0, losses: 0 }, null, new Set(['b1']), () => 0);
    expect(pick?.id).toBe('b2');
  });
});

describe('anciens puzzles', () => {
  it('sont convertis en défis sans perdre leur historique', async () => {
    const old: StoredPuzzle = {
      id: 'g1|4',
      gameId: 'g1',
      moveIndex: 4,
      fen: FORK,
      solution: ['d5c7', 'e8d7', 'c7a8', 'd7c8'],
      played: 'e1d2',
      label: 'blunder',
      theme: 'Attaques à la découverte',
      rating: 1400,
      due: 123,
      stage: 2,
      attempts: 5,
      successes: 3,
      createdAt: 1,
    };
    await db.puzzles.put(old);
    expect(await migratePuzzles()).toBe(1);
    const p = (await db.puzzles.get('g1|4'))!;
    expect(p).toMatchObject({ version: 2, line: ['d5c7', 'e8d7', 'c7a8'], goal: 'material', due: 123, stage: 2, attempts: 5, successes: 3, theme: 'Découvertes' });
    expect(fromStored(p).line).toHaveLength(3);
    // Une seconde passe ne refait rien.
    expect(await migratePuzzles()).toBe(0);
  });
});

describe('résumé de la combinaison', () => {
  it('met en avant l’idée clé', () => {
    expect(keyIdea({ fen: FORK, line: ['d5c7', 'e8d7', 'c7a8'], goal: 'material', gain: 5 })).toBe('Gagner une tour : fait une fourchette sur le roi et la tour.');
  });
});

describe('banque intégrée', () => {
  it('compte au moins 300 défis valides de 2 à 5 coups, en moins de 1 Mo', async () => {
    const { readFileSync, statSync } = await import('node:fs');
    const { Chess } = await import('chess.js');
    const bank = JSON.parse(readFileSync('src/features/puzzles/bank.json', 'utf8')) as { fen: string; line: string; goal: string; theme: string }[];
    expect(bank.length).toBeGreaterThanOrEqual(300);
    expect(statSync('src/features/puzzles/bank.json').size).toBeLessThan(1024 * 1024);
    expect(new Set(bank.map((e) => e.theme)).size).toBeGreaterThanOrEqual(6);
    for (const e of bank) {
      const moves = e.line.split(' ');
      expect(playerMoves(moves)).toBeGreaterThanOrEqual(2);
      expect(playerMoves(moves)).toBeLessThanOrEqual(5);
      expect(moves.length % 2).toBe(1);
      const c = new Chess(e.fen);
      for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
      if (e.goal === 'mate') expect(c.isCheckmate()).toBe(true);
    }
  });
});
