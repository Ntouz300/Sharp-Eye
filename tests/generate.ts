import { Chess } from 'chess.js';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmt = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).padStart(4, '0');
  return `${h}:${String(m).padStart(2, '0')}:${sec}`;
};

/** Produit une partie légale au format d'export chess.com (balises complètes et horloges). */
export function syntheticChessComGame(seed: number): string {
  const r = rng(seed);
  const chess = new Chess();
  const plies = 20 + Math.floor(r() * 80);
  const clocks = [600, 600];
  let body = '';
  for (let i = 0; i < plies && !chess.isGameOver(); i++) {
    const moves = chess.moves();
    const san = moves[Math.floor(r() * moves.length)];
    const n = chess.moveNumber();
    const white = chess.turn() === 'w';
    chess.move(san);
    clocks[i % 2] = Math.max(0.1, clocks[i % 2] - r() * 15);
    body += `${n}${white ? '.' : '...'} ${san} {[%clk ${fmt(clocks[i % 2])}]} `;
  }
  const result = chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : chess.isDraw() ? '1/2-1/2' : r() < 0.5 ? '1-0' : '0-1';
  const tags = {
    Event: 'Live Chess',
    Site: 'Chess.com',
    Date: '2026.10.01',
    Round: '-',
    White: `Blanc${seed}`,
    Black: `Noir${seed}`,
    Result: result,
    CurrentPosition: chess.fen(),
    Timezone: 'UTC',
    ECO: 'A00',
    ECOUrl: 'https://www.chess.com/openings/Irregular',
    UTCDate: '2026.10.01',
    UTCTime: '12:00:00',
    WhiteElo: String(800 + Math.floor(r() * 1400)),
    BlackElo: String(800 + Math.floor(r() * 1400)),
    TimeControl: '600',
    Termination: 'Partie terminée',
    StartTime: '12:00:00',
    EndDate: '2026.10.01',
    EndTime: '12:10:00',
    Link: `https://www.chess.com/game/live/${1000 + seed}`,
  };
  const head = Object.entries(tags)
    .map(([k, v]) => `[${k} "${v}"]`)
    .join('\n');
  return `${head}\n\n${body}${result}\n`;
}
