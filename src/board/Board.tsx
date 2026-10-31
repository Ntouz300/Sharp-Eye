import { useMemo, useRef } from 'react';
import type { Label } from '../analysis/classify';
import { LabelIcon } from '../ui/LabelIcon';
import { pieceName } from '../ui/notation';
import { CBURNETT } from './pieces/cburnett';

export interface Arrow {
  from: string;
  to: string;
  kind: 'played' | 'best';
}

interface BoardProps {
  fen: string;
  flipped: boolean;
  lastMove?: { from: string; to: string };
  arrows?: Arrow[];
  badge?: { square: string; label: Label };
  /** Change à chaque demi-coup affiché ; anime la pièce quand on avance d'un coup. */
  animateFrom?: string;
  coordinates: boolean;
  onSwipe?: (direction: 1 | -1) => void;
}

const FILES = 'abcdefgh';
const PIECE_URL: Record<string, string> = Object.fromEntries(
  Object.entries(CBURNETT).map(([k, svg]) => [k, `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`]),
);

function squareXY(square: string, flipped: boolean): [number, number] {
  const f = FILES.indexOf(square[0]);
  const r = Number(square[1]) - 1;
  return flipped ? [7 - f, r] : [f, 7 - r];
}

function parseFen(fen: string) {
  const pieces: { square: string; type: string; color: 'w' | 'b' }[] = [];
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else {
        pieces.push({ square: FILES[f] + (8 - i), type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? 'w' : 'b' });
        f++;
      }
    }
  });
  return pieces;
}

function ArrowShape({ arrow, flipped }: { arrow: Arrow; flipped: boolean }) {
  const [x1, y1] = squareXY(arrow.from, flipped);
  const [x2, y2] = squareXY(arrow.to, flipped);
  const ax = x1 + 0.5;
  const ay = y1 + 0.5;
  const bx = x2 + 0.5;
  const by = y2 + 0.5;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const head = 0.38;
  const ex = bx - ux * head;
  const ey = by - uy * head;
  const w = arrow.kind === 'best' ? 0.17 : 0.13;
  const color = arrow.kind === 'best' ? 'var(--arrow-best)' : 'var(--arrow-played)';
  const px = -uy;
  const py = ux;
  const hw = w * 1.9;
  return (
    <g className={`arrow arrow-${arrow.kind}`}>
      <line x1={ax + ux * 0.22} y1={ay + uy * 0.22} x2={ex} y2={ey} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <polygon points={`${bx},${by} ${ex + px * hw},${ey + py * hw} ${ex - px * hw},${ey - py * hw}`} fill={color} />
    </g>
  );
}

export function Board({ fen, flipped, lastMove, arrows = [], badge, animateFrom, coordinates, onSwipe }: BoardProps) {
  const pieces = useMemo(() => parseFen(fen), [fen]);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const squares = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (r + f) % 2 === 0;
      squares.push(<rect key={`${r}${f}`} x={f} y={r} width="1" height="1" fill={light ? 'var(--sq-light)' : 'var(--sq-dark)'} />);
    }
  }

  const highlight = lastMove
    ? [lastMove.from, lastMove.to].map((sq) => {
        const [x, y] = squareXY(sq, flipped);
        return <rect key={`hl-${sq}`} x={x} y={y} width="1" height="1" fill="var(--last-move)" />;
      })
    : null;

  const coords = coordinates
    ? Array.from({ length: 8 }, (_, i) => {
        const file = flipped ? FILES[7 - i] : FILES[i];
        const rank = flipped ? i + 1 : 8 - i;
        const fileLight = (7 + i) % 2 === 0;
        const rankLight = i % 2 === 0;
        return (
          <g key={`c${i}`} className="coord" aria-hidden="true">
            <text x={i + 0.94} y={7.95} textAnchor="end" fill={fileLight ? 'var(--coord-on-light)' : 'var(--coord-on-dark)'}>
              {file}
            </text>
            <text x={0.05} y={i + 0.2} fill={rankLight ? 'var(--coord-on-light)' : 'var(--coord-on-dark)'}>
              {rank}
            </text>
          </g>
        );
      })
    : null;

  let badgeEl = null;
  if (badge) {
    const [x, y] = squareXY(badge.square, flipped);
    const size = 0.42;
    badgeEl = (
      <g key={`${badge.square}-${badge.label}-${fen}`} className="badge" style={{ transformOrigin: `${x + 0.84}px ${y + 0.16}px` }}>
        <circle cx={x + 0.84} cy={y + 0.16} r={size / 2 + 0.03} fill="rgba(0,0,0,0.25)" />
        <svg x={x + 0.84 - size / 2} y={y + 0.16 - size / 2} width={size} height={size} viewBox="0 0 20 20" overflow="visible">
          <LabelIcon label={badge.label} size={20} title={false} />
        </svg>
      </g>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || !onSwipe) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  };

  return (
    <svg
      className="board"
      viewBox="0 0 8 8"
      role="img"
      aria-label="Échiquier"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
    >
      <g>{squares}</g>
      {highlight}
      {coords}
      <g>
        {pieces.map((p) => {
          const [x, y] = squareXY(p.square, flipped);
          let style: React.CSSProperties | undefined;
          let cls = 'piece';
          if (animateFrom && lastMove && p.square === lastMove.to) {
            const [fx, fy] = squareXY(animateFrom, flipped);
            style = { ['--dx' as string]: `${fx - x}px`, ['--dy' as string]: `${fy - y}px` };
            cls += ' piece-moving';
          }
          return (
            <image
              key={style ? `${p.square}-moving-${fen}` : `${p.square}${p.color}${p.type}`}
              className={cls}
              style={style}
              href={PIECE_URL[p.color + p.type]}
              x={x}
              y={y}
              width="1"
              height="1"
              aria-label={`${pieceName(p.type, p.color)} en ${p.square}`}
            />
          );
        })}
      </g>
      <g pointerEvents="none">
        {arrows.map((a) => (
          <ArrowShape key={`${a.kind}-${a.from}${a.to}`} arrow={a} flipped={flipped} />
        ))}
      </g>
      {badgeEl}
    </svg>
  );
}
