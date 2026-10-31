import { useRef } from 'react';
import type { GameAnalysis } from '../../analysis/analyzeGame';
import type { Label } from '../../analysis/classify';
import { LABEL_COLOR } from '../../ui/LabelIcon';

const MARKED: Label[] = ['brilliant', 'mistake', 'blunder', 'miss'];

/** Courbe de l'avantage (échelle Win %), touchable : toucher ou glisser place l'échiquier sur le coup. */
export function EvalGraph({ analysis, plies, ply, onSelect }: { analysis: GameAnalysis | null; plies: number; ply: number; onSelect: (ply: number) => void }) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 600;
  const H = 140;
  const wins = analysis?.winsWhite ?? [];
  const n = Math.max(plies, 1);
  const x = (i: number) => (i / n) * W;
  const y = (w: number) => H - (w / 100) * H;

  let area = '';
  if (wins.length) {
    area = `M0,${H} ` + wins.map((w, i) => `L${x(i).toFixed(1)},${y(w).toFixed(1)}`).join(' ') + ` L${x(wins.length - 1).toFixed(1)},${H} Z`;
  }

  const pick = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSelect(Math.round(ratio * n));
  };

  return (
    <div
      className="eval-graph"
      role="slider"
      aria-label="Graphique d'évaluation : toucher pour aller à un coup"
      aria-valuemin={0}
      aria-valuemax={plies}
      aria-valuenow={ply}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
        pick(e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons) pick(e.clientX);
      }}
    >
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <rect width={W} height={H} fill="var(--graph-bg)" />
        {area && <path d={area} fill="var(--graph-fill)" />}
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--accent)" strokeOpacity="0.5" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1={x(ply)} x2={x(ply)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {analysis?.moves.map((m, i) =>
        MARKED.includes(m.label) && wins[i + 1] !== undefined ? (
          <span
            key={i}
            className="graph-dot"
            style={{ left: `${(x(i + 1) / W) * 100}%`, top: `${(y(wins[i + 1]) / H) * 100}%`, background: LABEL_COLOR[m.label].bg }}
          />
        ) : null,
      )}
    </div>
  );
}
