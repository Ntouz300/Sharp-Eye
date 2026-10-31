import { useRef } from 'react';
import { parseTimeControl } from '../../pgn/parser';
import type { MoveNode } from '../../pgn/types';

/**
 * Temps restant à l'horloge (courbes) et temps passé par coup (barres) pour chaque joueur, à partir de %clk.
 * Les coups joués en zeitnot (moins de 10 % du temps initial, ou moins de 30 s) sont marqués en rouge.
 */
export function TimeGraph({ moves, timeControl, ply, onSelect }: { moves: MoveNode[]; timeControl?: string; ply: number; onSelect: (ply: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const W = 600;
  const H = 140;
  const tc = parseTimeControl(timeControl);
  const clocks = moves.map((m) => m.clock);
  const max = Math.max(tc?.base ?? 0, ...clocks.filter((c): c is number => c !== undefined), 1);
  const n = Math.max(moves.length, 1);
  const x = (i: number) => (i / n) * W;
  const y = (s: number) => H - (s / max) * (H - 8);
  const zeitnot = Math.max(30, (tc?.base ?? 300) * 0.1);

  const spent = moves.map((m, i) => {
    const prev = i >= 2 ? moves[i - 2].clock : tc?.base;
    return m.clock !== undefined && prev !== undefined ? Math.max(0, prev + (tc?.inc ?? 0) - m.clock) : 0;
  });
  const maxSpent = Math.max(...spent, 1);

  const line = (color: 'w' | 'b') =>
    moves
      .map((m, i) => (m.color === color && m.clock !== undefined ? `${x(i + 1).toFixed(1)},${y(m.clock).toFixed(1)}` : null))
      .filter(Boolean)
      .join(' ');

  const pick = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    onSelect(Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * n));
  };

  return (
    <div
      ref={ref}
      className="eval-graph time-graph"
      role="slider"
      aria-label="Graphique du temps : toucher pour aller à un coup"
      aria-valuemin={0}
      aria-valuemax={moves.length}
      aria-valuenow={ply}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && pick(e.clientX)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <rect width={W} height={H} fill="var(--surface-2)" />
        {spent.map((s, i) => (
          <rect
            key={i}
            x={x(i + 0.6)}
            width={Math.max(1, W / n - 1)}
            y={H - (s / maxSpent) * H * 0.45}
            height={(s / maxSpent) * H * 0.45}
            fill={moves[i].clock !== undefined && moves[i].clock! < zeitnot ? '#d33f3b' : moves[i].color === 'w' ? 'var(--text-muted)' : 'var(--accent)'}
            opacity="0.45"
          />
        ))}
        <polyline points={line('w')} fill="none" stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={line('b')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="time-legend" aria-hidden="true">
        <span>— Blancs</span>
        <span className="accent">- - Noirs</span>
        <span className="zeitnot">▮ zeitnot</span>
      </div>
    </div>
  );
}
