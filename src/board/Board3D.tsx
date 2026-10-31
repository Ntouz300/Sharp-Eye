import { useMemo } from 'react';
import { pieceName } from '../ui/notation';
import type { Arrow } from './Board';
import { CBURNETT } from './pieces/cburnett';

const FILES = 'abcdefgh';
const PIECE_URL: Record<string, string> = Object.fromEntries(
  Object.entries(CBURNETT).map(([k, svg]) => [k, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`]),
);

// Perspective calculée dans le SVG lui-même (pas de transformation CSS 3D) : le rendu reste net
// et les pièces tiennent debout, comme vues depuis sa chaise.
const D = 12; // distance de l'œil, en cases
const TILT = 1.1;
const BOTTOM = 7.2;
const scale = (depth: number) => D / (D + depth);
/** Projette un point du plateau (colonne 0-8, rangée affichée 0-8 depuis le fond). */
function project(gx: number, gy: number): [number, number] {
  const s = scale(8 - gy);
  return [4 + (gx - 4) * s, BOTTOM - (1 - s) * D * TILT];
}
const pt = ([x, y]: [number, number]) => `${x.toFixed(3)},${y.toFixed(3)}`;

function squareXY(square: string, flipped: boolean): [number, number] {
  const f = FILES.indexOf(square[0]);
  const r = Number(square[1]) - 1;
  return flipped ? [7 - f, r] : [f, 7 - r];
}

function quad(x: number, y: number, inset = 0) {
  return [project(x + inset, y + inset), project(x + 1 - inset, y + inset), project(x + 1 - inset, y + 1 - inset), project(x + inset, y + 1 - inset)].map(pt).join(' ');
}

interface Props {
  fen: string;
  flipped: boolean;
  lastMove?: { from: string; to: string };
  arrows?: Arrow[];
  onSquareTap?: (square: string) => void;
  selected?: string;
  targets?: string[];
}

export function Board3D({ fen, flipped, lastMove, arrows = [], onSquareTap, selected, targets = [] }: Props) {
  const pieces = useMemo(() => {
    const out: { square: string; type: string; color: 'w' | 'b' }[] = [];
    fen
      .split(' ')[0]
      .split('/')
      .forEach((row, i) => {
        let f = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) f += Number(ch);
          else out.push({ square: FILES[f++] + (8 - i), type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
        }
      });
    // Du fond vers l'avant, pour que les pièces proches masquent celles de derrière.
    return out.map((p) => ({ ...p, xy: squareXY(p.square, flipped) })).sort((a, b) => a.xy[1] - b.xy[1]);
  }, [fen, flipped]);

  const squares = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const name = FILES[flipped ? 7 - x : x] + (flipped ? y + 1 : 8 - y);
      const light = (x + y) % 2 === 0;
      const hl = lastMove && (name === lastMove.from || name === lastMove.to);
      squares.push(
        <polygon
          key={name}
          points={quad(x, y)}
          fill={light ? 'var(--sq-light)' : 'var(--sq-dark)'}
          onClick={onSquareTap ? () => onSquareTap(name) : undefined}
          aria-label={name}
        />,
      );
      if (hl || name === selected) squares.push(<polygon key={`hl-${name}`} points={quad(x, y)} fill="var(--last-move)" stroke={name === selected ? 'var(--accent)' : 'none'} strokeWidth="0.04" pointerEvents="none" />);
    }

  const [nearL] = project(0, 8);
  const [nearR] = project(8, 8);
  const edge = `${pt(project(0, 8))} ${pt(project(8, 8))} ${nearR.toFixed(3)},${BOTTOM + 0.18} ${nearL.toFixed(3)},${BOTTOM + 0.18}`;

  return (
    <svg className="board board-3d-view" viewBox="-0.1 0.3 8.2 7.15" role="img" aria-label="Échiquier en perspective">
      <polygon points={edge} fill="var(--sq-dark)" opacity="0.7" />
      {squares}
      {targets.map((t) => {
        const [x, y] = squareXY(t, flipped);
        return <polygon key={`t${t}`} points={quad(x, y, 0.36)} fill="rgba(0,0,0,0.28)" pointerEvents="none" />;
      })}
      <g pointerEvents="none">
        {arrows.map((a) => {
          const [x1, y1] = squareXY(a.from, flipped);
          const [x2, y2] = squareXY(a.to, flipped);
          const p1 = project(x1 + 0.5, y1 + 0.5);
          const p2 = project(x2 + 0.5, y2 + 0.5);
          const color = a.kind === 'best' ? 'var(--arrow-best)' : 'var(--arrow-played)';
          return (
            <g key={`${a.kind}${a.from}${a.to}`}>
              <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} stroke={color} strokeWidth="0.14" strokeLinecap="round" />
              <circle cx={p2[0]} cy={p2[1]} r="0.16" fill={color} />
            </g>
          );
        })}
        {pieces.map((p) => {
          const [x, y] = p.xy;
          const [cx, base] = project(x + 0.5, y + 0.82);
          const size = scale(8 - (y + 0.5)) * 1.12;
          return (
            <g key={`${p.square}${p.color}${p.type}`}>
              <ellipse cx={cx} cy={base - size * 0.04} rx={size * 0.3} ry={size * 0.08} fill="rgba(0,0,0,0.25)" />
              <image href={PIECE_URL[p.color + p.type]} x={cx - size / 2} y={base - size} width={size} height={size} aria-label={`${pieceName(p.type, p.color)} en ${p.square}`} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
