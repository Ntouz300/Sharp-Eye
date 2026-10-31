import { useEffect, useRef } from 'react';
import type { GameAnalysis } from '../../analysis/analyzeGame';
import type { MoveNode } from '../../pgn/types';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan, formatClock } from '../../ui/notation';
import { useSettings } from '../settings/settings';

/** Liste des coups par paires, chaque coup suivi de son icône de classification et de l'horloge. */
export function MoveList({ moves, analysis, ply, onSelect, onSwipe }: {
  moves: MoveNode[];
  analysis: GameAnalysis | null;
  ply: number;
  onSelect: (ply: number) => void;
  onSwipe: (d: 1 | -1) => void;
}) {
  const notation = useSettings((s) => s.notation);
  const listRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [ply]);

  const rows: { n: number; w?: number; b?: number }[] = [];
  moves.forEach((m, i) => {
    if (m.color === 'w' || !rows.length) rows.push({ n: m.moveNumber, [m.color]: i });
    else rows[rows.length - 1].b = i;
  });

  const cell = (i: number | undefined) => {
    if (i === undefined) return <span className="move-cell empty" />;
    const m = moves[i];
    const a = analysis?.moves[i];
    const prevClock = i >= 2 ? moves[i - 2].clock : undefined;
    const spent = m.clock !== undefined && prevClock !== undefined ? prevClock - m.clock : undefined;
    return (
      <button type="button" className="move-cell" aria-current={ply === i + 1} onClick={() => onSelect(i + 1)}>
        <span className="move-san">{displaySan(m.san, notation)}</span>
        {a ? <LabelIcon label={a.label} size={16} /> : <span className="icon-placeholder" />}
        {m.clock !== undefined && (
          <span className="move-clock" title={spent !== undefined ? `${Math.max(0, spent).toFixed(1)} s passées` : undefined}>
            {formatClock(m.clock)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="move-list"
      ref={listRef}
      onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 2) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      {rows.map((r, k) => (
        <div className="move-row" key={k}>
          <span className="move-number">{r.n}.</span>
          {cell(r.w)}
          {cell(r.b)}
        </div>
      ))}
    </div>
  );
}
