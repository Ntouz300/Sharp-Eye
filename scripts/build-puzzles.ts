/**
 * Construit la banque de défis intégrée (src/features/puzzles/bank.json) avec Stockfish, sans réseau.
 * Des parties d'entraînement sont jouées par le moteur avec des erreurs volontaires, depuis des ouvertures
 * connues (data/*.tsv). Quand un camp vient de se tromper, la position devient un défi si :
 *  - le premier coup gagnant est unique (le 2e meilleur coup ne gagne pas) ;
 *  - la combinaison compte 2 à 5 coups du joueur et s'arrête quand le gain est acquis
 *    (mat, matériel gagné stable ou avantage décisif).
 * Usage : npx tsx scripts/build-puzzles.ts <graine> <nombre> <sortie.jsonl>
 */
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
import { moveIdea } from '../src/analysis/explain';
import { materialBalance } from '../src/analysis/material';
import { UciDriver } from '../src/engine/uci';
import type { PositionEval } from '../src/engine/types';
import { winPercentFor, type Score } from '../src/analysis/winPercent';

const [seedArg, countArg, out] = process.argv.slice(2);
let seed = Number(seedArg) || 1;
const target = Number(countArg) || 100;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

const require = createRequire(import.meta.url);
async function engine() {
  const init = require('stockfish');
  const sf = await init('lite-single');
  const d = new UciDriver((c) => sf.sendCommand(c));
  sf.listener = (l: string) => d.receive(l);
  await d.init();
  return d;
}

const openings = readdirSync(new URL('../data/', import.meta.url))
  .filter((f) => f.endsWith('.tsv'))
  .flatMap((f) => readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').split('\n').slice(1))
  .map((l) => l.split('\t')[2])
  .filter(Boolean);

const win = (s: Score, c: 'w' | 'b') => winPercentFor(s, c);
const isMateFor = (s: Score, c: 'w' | 'b') => s.mate !== undefined && s.mate !== 0 && (c === 'w' ? s.mate > 0 : s.mate < 0);
const mat = (fen: string, c: 'w' | 'b') => materialBalance(fen) * (c === 'w' ? 1 : -1);
const pieces = (fen: string) => fen.split(' ')[0].replace(/[^nbrqNBRQ]/g, '').length;

function themeOf(idea: string | null, fen: string, goal: string): string {
  if (goal === 'mate') return 'Mats';
  const t = idea ?? '';
  if (/fourchette/.test(t)) return 'Fourchettes';
  if (/cloue/.test(t)) return 'Clouages';
  if (/enfilade/.test(t)) return 'Enfilades';
  if (/découvre/.test(t)) return 'Découvertes';
  if (/dame|promeut/.test(t) && /va à dame|promeut/.test(t)) return 'Promotions';
  if (pieces(fen) <= 6) return 'Finales';
  return 'Pièces en prise';
}

async function main() {
  const sf = await engine();
  const an = (fen: string, depth: number, mpv: number): Promise<PositionEval> => sf.analyze(fen, depth, mpv);
  let made = 0;
  const seen = new Set<string>();
  while (made < target) {
    // Ouverture connue, puis jeu du moteur avec des erreurs.
    const c = new Chess();
    try {
      c.loadPgn(openings[Math.floor(rnd() * openings.length)]);
    } catch {
      continue;
    }
    let prev: Score | null = null;
    let lopsided = 0;
    for (let ply = 0; ply < 120 && !c.isGameOver(); ply++) {
      const fen = c.fen();
      const ev = await an(fen, 7, 3);
      const side = c.turn();
      const best = ev.lines[0];
      if (!best) break;
      // L'adversaire vient de se tromper : le camp au trait gagne, alors qu'avant ce n'était pas le cas.
      if (prev && !seen.has(fen) && (win(best.score, side) >= 75 || isMateFor(best.score, side)) && win(prev, side) <= 60) {
        seen.add(fen);
        const p = await buildPuzzle(fen, an);
        if (p) {
          appendFileSync(out, JSON.stringify(p) + '\n');
          made++;
          console.log(made, p.theme, p.rating, p.line.split(' ').length);
          if (made >= target) break;
        }
      }
      prev = best.score;
      // Partie jouée d'avance : on en commence une autre, les défis naissent des positions encore disputées.
      const w = win(best.score, side);
      lopsided = w > 92 || w < 8 ? lopsided + 1 : 0;
      if (lopsided >= 4) break;
      // Choix du coup : surtout le meilleur, parfois un autre des 3, parfois un coup au hasard (erreur).
      const r = rnd();
      let uci = best.pv[0];
      if (r < 0.1) {
        const ms = c.moves({ verbose: true });
        const m = ms[Math.floor(rnd() * ms.length)];
        uci = m.from + m.to + (m.promotion ?? '');
      } else if (r < 0.45 && ev.lines.length > 1) uci = ev.lines[1 + Math.floor(rnd() * (ev.lines.length - 1))].pv[0];
      try {
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      } catch {
        break;
      }
    }
  }
  process.exit(0);
}

async function buildPuzzle(fen: string, an: (f: string, d: number, m: number) => Promise<PositionEval>) {
  const side = new Chess(fen).turn();
  const first = await an(fen, 14, 3);
  const [l1, l2] = first.lines;
  if (!l1 || !l1.pv[0]) return null;
  if (!(win(l1.score, side) >= 75 || isMateFor(l1.score, side))) return null;
  // Unicité du premier coup : le 2e meilleur ne gagne pas (ou nettement moins).
  if (l2 && (isMateFor(l2.score, side) || win(l2.score, side) >= 65 || win(l1.score, side) - win(l2.score, side) < 15)) return null;
  const startMat = mat(fen, side);
  const c = new Chess(fen);
  const line: string[] = [];
  let playerMoves = 0;
  let goal: 'mate' | 'material' | 'decisive' | null = null;
  let ev = first;
  for (let k = 0; k < 5; k++) {
    const mv = ev.lines[0]?.pv[0];
    if (!mv) return null;
    c.move({ from: mv.slice(0, 2), to: mv.slice(2, 4), promotion: mv[4] });
    line.push(mv);
    playerMoves++;
    if (c.isCheckmate()) {
      goal = 'mate';
      break;
    }
    if (c.isGameOver()) return null;
    const reply = await an(c.fen(), 14, 1);
    const r = reply.lines[0]?.pv[0];
    if (!r) return null;
    c.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] });
    line.push(r);
    if (c.isGameOver()) return null;
    ev = await an(c.fen(), 14, 1);
    const s = ev.lines[0]?.score;
    if (!s || !(win(s, side) >= 70 || isMateFor(s, side))) return null;
    const gained = mat(c.fen(), side) - startMat;
    // Simple prise d'une pièce en prise : pas une combinaison, on écarte.
    if (playerMoves === 1 && gained >= 2 && !isMateFor(s, side)) return null;
    if (playerMoves >= 2 && !isMateFor(s, side) && gained >= 2) {
      // Matériel gagné stable : le coup suivant ne le rend pas.
      goal = 'material';
      // Le défi se termine sur un coup du joueur : on retire la réponse adverse.
      line.pop();
      break;
    }
  }
  if (!goal) {
    // 5 coups joués sans mat ni matériel : avantage décisif ? On termine sur le dernier coup du joueur.
    if (line.length % 2 === 0) line.pop();
    const s = ev.lines[0]?.score;
    if (!s || win(s, side) < 85) return null;
    goal = 'decisive';
  }
  if (goal === 'mate' && line.length % 2 === 0) return null;
  playerMoves = Math.ceil(line.length / 2);
  if (playerMoves < 2 || playerMoves > 5) return null;
  // Tentative naturelle : parmi les 2e et 3e lignes, une prise ou un échec si possible.
  const natural = first.lines.slice(1).find((l) => /x|\+/.test(new Chess(fen).move({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), promotion: l.pv[0][4] }).san)) ?? first.lines[1];
  const idea = moveIdea(fen, line, l1.score);
  const theme = themeOf(idea, fen, goal);
  const quiet = !/x|\+/.test(new Chess(fen).move({ from: line[0].slice(0, 2), to: line[0].slice(2, 4), promotion: line[0][4] }).san);
  const rating = Math.round(900 + 180 * (playerMoves - 2) + (quiet ? 300 : 0) + (goal === 'decisive' ? 150 : 0) + (pieces(fen) > 10 ? 100 : 0));
  return {
    fen,
    line: line.join(' '),
    goal,
    gain: goal === 'material' ? Math.round(mat(c.fen(), side) - startMat) : undefined,
    theme,
    rating,
    alt: natural ? natural.pv.slice(0, 4).join(' ') : undefined,
  };
}

void main();
