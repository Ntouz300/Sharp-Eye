/**
 * Construit src/features/theory/tree.json : pour chaque position des ouvertures de l'onglet Théorie,
 * les 6 suites les plus répandues dans la base ouverte lichess-org/chess-openings (CC0, data/*.tsv),
 * avec le nom de la variante. « Popularité » = nombre de lignes répertoriées qui passent par ce coup.
 * Usage : npx tsx scripts/build-theory.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { positionKey } from '../src/analysis/positionKey.js';
import { OPENINGS } from '../src/features/theory/openings';
import { frenchName } from '../src/features/theory/names';

type Node = Map<string, { count: number; key: string }>;
const tree = new Map<string, Node>();
const names = new Map<string, string>();
let used = 0;
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  for (const row of readFileSync(`data/${f}.tsv`, 'utf8').trim().split('\n').slice(1)) {
    const [, name, pgn] = row.split('\t');
    if (!OPENINGS.some((o) => o.match.test(name))) continue;
    used++;
    const c = new Chess();
    for (const san of pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/)) {
      const from = positionKey(c.fen());
      const m = c.move(san);
      const key = positionKey(c.fen());
      const node = tree.get(from) ?? new Map();
      const e = node.get(m.san) ?? { count: 0, key };
      e.count++;
      node.set(m.san, e);
      tree.set(from, node);
    }
    names.set(positionKey(c.fen()), frenchName(name));
  }
}
// Nom d'une suite : celui de la position atteinte, sinon de la variante la plus répandue qui en part.
const nameOf = (key: string, depth = 0): string | undefined => {
  if (names.has(key)) return names.get(key);
  if (depth > 6) return undefined;
  const next = [...(tree.get(key)?.values() ?? [])].sort((a, b) => b.count - a.count)[0];
  return next ? nameOf(next.key, depth + 1) : undefined;
};
const out: Record<string, [string, number, string?][]> = {};
for (const [key, node] of tree) {
  out[key] = [...node.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([san, e]) => {
      const n = nameOf(e.key);
      return n ? [san, e.count, n] : [san, e.count];
    });
}
const json = JSON.stringify(out);
writeFileSync('src/features/theory/tree.json', json + '\n');
console.log(`${used} lignes, ${tree.size} positions, ${(json.length / 1024).toFixed(0)} Ko`);
