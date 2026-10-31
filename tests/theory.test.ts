import { readFileSync, statSync } from 'node:fs';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { positionKey } from '../src/analysis/positionKey.js';
import { frenchName } from '../src/features/theory/names';
import { lineMoves, OPENINGS, searchOpenings } from '../src/features/theory/openings';
import { suggestions } from '../src/features/theory/theory';

const tree = JSON.parse(readFileSync('src/features/theory/tree.json', 'utf8')) as Record<string, [string, number, string?][]>;
const words = (t: string) => t.trim().split(/\s+/).length;

describe('ouvertures de l’onglet Théorie', () => {
  it('couvre les 16 ouvertures demandées', () => {
    expect(OPENINGS.map((o) => o.id)).toEqual(['viennoise', 'ecossaise', 'italienne', 'espagnole', 'londres', 'caro-kann', 'sicilienne', 'francaise', 'scandinave', 'pirc', 'gda', 'gdr', 'slave', 'est-indienne', 'nimzo', 'hollandaise']);
    const sic = OPENINGS.find((o) => o.id === 'sicilienne')!;
    expect([sic.main.name, ...sic.variations.map((v) => v.name)].join(' ')).toMatch(/Najdorf.*dragon.*Alapin/i);
  });

  for (const o of OPENINGS)
    it(`${o.name} : lignes légales, 2 à 4 variantes, 6 coups clés au moins de 15 mots au plus`, () => {
      expect(o.variations.length).toBeGreaterThanOrEqual(2);
      expect(o.variations.length).toBeLessThanOrEqual(4);
      let notes = 0;
      for (const l of [o.main, ...o.variations]) {
        const c = new Chess();
        for (const san of lineMoves(l)) expect(() => c.move(san), `${l.name} : ${san}`).not.toThrow();
        for (const [ply, text] of Object.entries(l.notes)) {
          expect(Number(ply)).toBeLessThanOrEqual(lineMoves(l).length);
          expect(words(text), text).toBeLessThanOrEqual(15);
          notes++;
        }
      }
      expect(Object.keys(o.main.notes).length).toBeGreaterThanOrEqual(6);
      expect(notes).toBeGreaterThanOrEqual(6);
      // Chaque coup de la ligne principale figure dans les suites proposées (4 au plus).
      const c = new Chess();
      for (const san of lineMoves(o.main)) {
        const next = suggestions(tree, c.fen(), san, o.main.name);
        expect(next.length).toBeLessThanOrEqual(4);
        expect(next.map((n) => n.san), `${o.name} : ${san}`).toContain(c.move(san).san);
      }
      // Les premiers coups viennent bien de la base Lichess.
      expect(tree[positionKey(new Chess().fen())].map((n) => n[0])).toContain(lineMoves(o.main)[0]);
    });

  it('trouve une ouverture par nom français, anglais, début de nom ou code ECO', () => {
    expect(searchOpenings('vienne')[0].id).toBe('viennoise');
    expect(searchOpenings('Vienna')[0].id).toBe('viennoise');
    expect(searchOpenings('caro')[0].id).toBe('caro-kann');
    expect(searchOpenings('C25').map((o) => o.id)).toEqual(['viennoise']);
    expect(searchOpenings('najdorf')[0].id).toBe('sicilienne');
    expect(searchOpenings('ecossaise')[0].id).toBe('ecossaise');
  });

  it('propose au plus 4 suites, triées par popularité, avec un nom de variante', () => {
    const root = suggestions(tree, new Chess().fen());
    expect(root.length).toBeLessThanOrEqual(4);
    expect(root.map((r) => r.count)).toEqual([...root.map((r) => r.count)].sort((a, b) => b - a));
    // Après 1.e4, la Scandinave (moins répandue) reste proposée quand c'est la ligne étudiée.
    const e4 = new Chess();
    e4.move('e4');
    const s = suggestions(tree, e4.fen(), 'd5');
    expect(s).toHaveLength(4);
    expect(s.find((x) => x.san === 'd5')?.inLine).toBe(true);
    const c = new Chess();
    c.move('e4');
    c.move('e5');
    c.move('Nc3');
    expect(tree[positionKey(c.fen())].every((n) => n[2]?.startsWith('Partie viennoise'))).toBe(true);
  });

  it('traduit les noms de variantes', () => {
    expect(frenchName('Caro-Kann Defense: Advance Variation')).toBe('Caro-Kann : variante d’avance');
    expect(frenchName('Vienna Game')).toBe('Partie viennoise');
  });

  it('reste léger : moins de 500 Ko ajoutés', () => {
    const size = statSync('src/features/theory/tree.json').size + statSync('src/features/theory/openings.ts').size + statSync('src/features/theory/names.ts').size;
    expect(size).toBeLessThan(500 * 1024);
  });
});
