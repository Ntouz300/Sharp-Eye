import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { explainMove, type ExplainInput } from '../src/analysis/explain';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

/** Explique un coup et vérifie les limites de longueur (2 phrases à l'écran, 15 mots à l'oral). */
function explain(input: ExplainInput) {
  const e = explainMove(input);
  if (e) {
    expect(sentences(e.text), e.text).toBeLessThanOrEqual(2);
    expect(words(e.spoken), e.spoken).toBeLessThanOrEqual(15);
    expect(e.spoken).not.toMatch(/centipion|\d+,\d+ pion/);
  }
  return e;
}

const base = { replyPv: [] as string[], scoreAfter: { cp: 0 } };

describe('explications en français', () => {
  it('fourchette manquée : nomme le coup et les pièces visées', () => {
    const e = explain({ ...base, label: 'miss', fenBefore: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', playedUci: 'e1e2', bestPv: ['d5c7', 'e8d7', 'c7a8'], bestScore: { cp: 500 } });
    expect(e?.text).toBe('Ton adversaire venait de se tromper. Il fallait jouer Cc7+, qui fait une fourchette sur le roi et la tour.');
    expect(e?.spoken).toBe('Il fallait jouer Cc7+, qui fait une fourchette sur le roi et la tour.');
  });

  it('clouage manqué', () => {
    const e = explain({ ...base, label: 'mistake', fenBefore: '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 30', playedUci: 'e1e2', bestPv: ['f1b5'], bestScore: { cp: 300 } });
    expect(e?.text).toBe('Ton avantage disparaît. Mieux valait Fb5, qui cloue le cavalier sur le roi.');
  });

  it('pièce laissée en prise', () => {
    const e = explain({ label: 'blunder', fenBefore: '4k3/8/8/3p4/8/8/8/4KB2 w - - 0 1', playedUci: 'f1c4', bestPv: ['f1e2'], bestScore: { cp: 0 }, replyPv: ['d5c4'], scoreAfter: { cp: -300 } });
    expect(e?.text).toMatch(/^Tu laisses le fou en c4 en prise\. Mieux valait Fe2/);
    expect(e?.spoken).toContain('Tu laisses le fou en c4 en prise.');
  });

  it('mat manqué et mat subi', () => {
    const pos = { fenBefore: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', playedUci: 'g1f1', replyPv: [], bestPv: ['a1a8'] };
    expect(explain({ ...pos, label: 'blunder', bestScore: { mate: 1 }, scoreAfter: { cp: 400 } })?.text).toContain('Mieux valait Ta8#, qui fait échec et mat.');
    expect(explain({ ...pos, label: 'blunder', bestScore: { cp: 0 }, scoreAfter: { mate: -3 } })?.text).toMatch(/^Tu permets un mat en 3\./);
  });

  it('finale : pousser le pion passé', () => {
    const e = explain({ ...base, label: 'inaccuracy', fenBefore: '8/5k2/8/1P6/8/8/5K2/8 w - - 0 50', playedUci: 'f2e3', bestPv: ['b5b6'], bestScore: { cp: 300 } });
    expect(e?.text).toContain('Mieux valait b6, qui pousse le pion passé.');
  });

  it('coup passif', () => {
    const e = explain({ ...base, label: 'inaccuracy', fenBefore: '4k3/8/8/8/4N3/8/8/4K3 w - - 0 30', playedUci: 'e4g3', bestPv: ['e4d6'], bestScore: { cp: 200 } });
    expect(e?.text).toBe('Ce recul du cavalier est passif. Mieux valait Cd6+, qui met le roi adverse en échec.');
  });

  it('développement retardé', () => {
    const e = explain({ ...base, label: 'inaccuracy', fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', playedUci: 'a2a3', bestPv: ['g1f3'], bestScore: { cp: 40 } });
    expect(e?.text).toBe('Tu retardes ton développement. Mieux valait Cf3, qui développe le cavalier.');
  });

  it('roque tardif', () => {
    const e = explain({ ...base, label: 'inaccuracy', fenBefore: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 10', playedUci: 'h2h3', bestPv: ['e1g1'], bestScore: { cp: 40 } });
    expect(e?.text).toBe('Ton roi reste au centre. Mieux valait O-O, qui met ton roi à l’abri.'.replace('’', "'"));
  });

  it('coup brillant : une raison courte ; bon coup : rien', () => {
    const brilliant = explain({ ...base, label: 'brilliant', fenBefore: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', playedUci: 'd5c7', bestPv: ['d5c7'], bestScore: { cp: 500 } });
    expect(brilliant?.spoken).toBe('Sacrifice : ce coup fait une fourchette sur le roi et la tour.');
    expect(explain({ ...base, label: 'best', fenBefore: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', playedUci: 'e1e2', bestPv: [], bestScore: { cp: 0 } })).toBeNull();
  });
});

// Couverture sur de vraies parties : les deux anciennes phrases vagues ne doivent plus apparaître
// (moins de 10 % des coups classés), et chaque coup à revoir nomme le meilleur coup.
describe('explications sur les parties de tests/fixtures', () => {
  it('précises sur au moins 90 % des coups classés', async () => {
    const { createNodeEngine } = await import('./nodeEngine');
    const { analyzeGame } = await import('../src/analysis/analyzeGame');
    const { REVIEW_LEVELS } = await import('../src/analysis/config');
    const { importPgn } = await import('../src/pgn/parser');
    const { syntheticChessComGame } = await import('./generate');
    (REVIEW_LEVELS as Record<string, { depth: number }>).quick.depth = 10;
    const engine = await createNodeEngine();
    const texts = ['chesscom-opera.pgn', 'lichess-annotated.pgn', 'mixed-errors.pgn'].map((f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
    // Parties aléatoires générées : beaucoup d'erreurs variées.
    for (let i = 1; i <= 4; i++) texts.push(syntheticChessComGame(i));
    const vague = [/^Un coup un peu passif : le moteur préférait une suite plus active\.$/, /^Ce coup fait nettement baisser tes chances de gain\.$/];
    let classified = 0;
    let generic = 0;
    for (const t of texts)
      for (const g of importPgn(t).games) {
        const a = await analyzeGame(g, { level: 'quick', engine });
        for (const m of a.moves) {
          if (!['inaccuracy', 'mistake', 'blunder', 'miss'].includes(m.label)) continue;
          classified++;
          if (!m.explanation || vague.some((v) => v.test(m.explanation!))) generic++;
          expect(m.explanation).toMatch(/Mieux valait|Il fallait jouer/);
          expect(words(m.spokenExplanation ?? '')).toBeLessThanOrEqual(15);
        }
      }
    expect(classified).toBeGreaterThan(20);
    expect(generic / classified).toBeLessThan(0.1);
  }, 240000);
});
