// Construit src/analysis/book.json à partir des fichiers TSV de lichess-org/chess-openings (CC0).
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { positionKey } from '../src/analysis/positionKey.js';

const positions = new Set();
const named = {};
let lines = 0;
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = readFileSync(`data/${f}.tsv`, 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    for (const san of sans) {
      chess.move(san);
      positions.add(positionKey(chess.fen()));
    }
    named[positionKey(chess.fen())] = [eco, name];
    lines++;
  }
}
writeFileSync('src/analysis/book.json', JSON.stringify({ positions: [...positions], named }));
console.log(`${lines} lignes, ${positions.size} positions`);
