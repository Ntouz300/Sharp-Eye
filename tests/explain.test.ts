import { describe, expect, it } from 'vitest';
import { explainMove } from '../src/analysis/explain';

describe('explications en français', () => {
  it('fourchette de cavalier manquée', () => {
    const text = explainMove({
      label: 'miss',
      fenBefore: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1',
      playedUci: 'e1e2',
      bestPv: ['d5c7', 'e8d7', 'c7a8'],
      bestScore: { cp: 500 },
      replyPv: [],
      scoreAfter: { cp: 0 },
    });
    expect(text).toBe('Tu manques une fourchette du cavalier en c7 sur le roi et la tour.');
  });

  it('pièce laissée en prise', () => {
    const text = explainMove({
      label: 'blunder',
      fenBefore: '4k3/8/8/3p4/8/8/8/4KB2 w - - 0 1',
      playedUci: 'f1c4',
      bestPv: ['f1e2'],
      bestScore: { cp: 0 },
      replyPv: ['d5c4'],
      scoreAfter: { cp: -300 },
    });
    expect(text).toContain('Ce coup laisse le fou en c4 sans protection.');
  });

  it('mat manqué et mat subi', () => {
    const base = { fenBefore: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', playedUci: 'g1f1', replyPv: [], bestPv: ['a1a8'] };
    expect(explainMove({ ...base, label: 'blunder', bestScore: { mate: 1 }, scoreAfter: { cp: 400 } })).toContain('Tu manques un mat en 1.');
    expect(explainMove({ ...base, label: 'blunder', bestScore: { cp: 0 }, scoreAfter: { mate: -3 } })).toContain('Ce coup permet un mat en 3.');
  });

  it('pas d’explication pour un bon coup', () => {
    expect(explainMove({ label: 'best', fenBefore: '4k3/8/8/8/8/8/8/4K3 w - - 0 1', playedUci: 'e1e2', bestPv: [], bestScore: { cp: 0 }, replyPv: [], scoreAfter: { cp: 0 } })).toBeNull();
  });
});
