import { describe, expect, it } from 'vitest';
import { castlingFor, findGrid, placementFrom, recognize, type Img, type Templates } from '../src/features/position/recognize';

/** Image synthétique : un damier de 8 × 8 cases dans un cadre d'interface. */
function boardImage(x0: number, y0: number, size: number, W = 640, H = 480, blocks: { f: number; r: number; color: number }[] = []): Img {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c: [number, number, number] = [245, 240, 230];
      // Un peu de « texte » d'interface à gauche.
      if (x < x0 - 10 && y % 14 < 3 && x % 9 < 5) c = [60, 60, 60];
      const f = Math.floor((x - x0) / size);
      const r = Math.floor((y - y0) / size);
      if (f >= 0 && f < 8 && r >= 0 && r < 8) {
        c = (f + r) % 2 ? [181, 136, 99] : [240, 217, 181];
        const b = blocks.find((p) => p.f === f && p.r === r);
        const u = (x - x0) / size - f;
        const v = (y - y0) / size - r;
        if (b && u > 0.25 && u < 0.75 && v > 0.15 && v < 0.85) c = [b.color, b.color, b.color];
      }
      data.set([...c, 255], (y * W + x) * 4);
    }
  return { width: W, height: H, data };
}

describe('reconnaissance d’une capture', () => {
  it('retrouve la grille de l’échiquier au milieu de l’interface', () => {
    const g = findGrid(boardImage(150, 40, 50))!;
    expect(Math.abs(g.x - 150)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.y - 40)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.size - 50)).toBeLessThan(1);
  });

  it('distingue cases vides, pièces blanches et noires', () => {
    // Modèle unique : un rectangle plein, donc toute pièce est lue comme ce type.
    const rect = new Uint8Array(24 * 24).fill(1);
    const templates: Templates = { r: rect };
    const img = boardImage(100, 20, 52, 640, 480, [
      { f: 4, r: 7, color: 250 },
      { f: 4, r: 0, color: 20 },
    ]);
    const rec = recognize(img, templates)!;
    const pieces = rec.squares.flatMap((row, r) => row.map((s, f) => (s.piece ? `${s.piece}${'abcdefgh'[f]}${8 - r}` : null))).filter(Boolean);
    expect(pieces).toEqual(['re8', 'Re1']);
    expect(rec.whiteAtBottom).toBe(true);
  });

  it('écrit la FEN dans le bon sens, même vue depuis les noirs', () => {
    const sq: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
    sq[7][4] = 'K';
    sq[7][7] = 'R';
    sq[0][4] = 'k';
    expect(placementFrom(sq, true)).toBe('4k3/8/8/8/8/8/8/4K2R');
    expect(placementFrom(sq, false)).toBe('R2K4/8/8/8/8/8/8/3k4');
  });

  it('déduit les roques possibles', () => {
    expect(castlingFor('r3k2r/8/8/8/8/8/8/R3K2R')).toBe('KQkq');
    expect(castlingFor('4k3/8/8/8/8/8/8/4K2R')).toBe('K');
    expect(castlingFor('4k3/8/8/8/8/8/8/3K3R')).toBe('-');
  });
});
