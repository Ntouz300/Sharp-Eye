import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/themes/themes';

const css = readFileSync(new URL('../src/themes/themes.css', import.meta.url), 'utf8');

function tokens(id: string): Record<string, string> {
  const block = new RegExp(`\\[data-theme='${id}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

function luminance(hex: string): number {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('thèmes', () => {
  for (const t of THEMES) {
    describe(t.name, () => {
      const k = tokens(t.id);
      it('définit tous les tokens nécessaires', () => {
        for (const name of ['bg', 'surface', 'surface-2', 'text', 'text-muted', 'accent', 'accent-text', 'sq-light', 'sq-dark']) expect(k[name], name).toBeTruthy();
      });
      it.each([
        ['text', 'bg'],
        ['text', 'surface'],
        ['text', 'surface-2'],
        ['text-muted', 'surface'],
        ['text-muted', 'surface-2'],
        ['accent-text', 'accent'],
      ])('contraste %s sur %s ≥ 4,5:1 (WCAG AA)', (fg, bg) => {
        expect(contrast(k[fg], k[bg])).toBeGreaterThanOrEqual(4.5);
      });
    });
  }
});
