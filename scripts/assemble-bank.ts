/**
 * Assemble la banque de défis (src/features/puzzles/bank.json) à partir des fichiers produits par build-puzzles.ts :
 * vérifie chaque combinaison, retire les doublons et trie par thème puis difficulté.
 * Usage : npx tsx scripts/assemble-bank.ts gen1.jsonl gen2.jsonl …
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import type { BankEntry } from '../src/features/puzzles/challenge';

const out: BankEntry[] = [];
const seen = new Set<string>();
for (const file of process.argv.slice(2)) {
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    if (!raw.trim()) continue;
    const e = JSON.parse(raw) as BankEntry;
    const key = e.fen.split(' ').slice(0, 4).join(' ');
    if (seen.has(key)) continue;
    const moves = e.line.split(' ');
    if (moves.length % 2 === 0 || moves.length < 3 || moves.length > 9) continue;
    const c = new Chess(e.fen);
    try {
      for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    } catch {
      continue;
    }
    if (e.goal === 'mate' && !c.isCheckmate()) continue;
    seen.add(key);
    out.push({ fen: e.fen, line: e.line, goal: e.goal, ...(e.gain ? { gain: e.gain } : {}), theme: e.theme, rating: e.rating, ...(e.alt ? { alt: e.alt } : {}) });
  }
}
out.sort((a, b) => a.theme.localeCompare(b.theme) || a.rating - b.rating || a.fen.localeCompare(b.fen));
const json = JSON.stringify(out);
writeFileSync(new URL('../src/features/puzzles/bank.json', import.meta.url), json + '\n');
const themes = new Map<string, number>();
for (const e of out) themes.set(e.theme, (themes.get(e.theme) ?? 0) + 1);
console.log(`${out.length} défis, ${(json.length / 1024).toFixed(0)} Ko`, Object.fromEntries(themes));
