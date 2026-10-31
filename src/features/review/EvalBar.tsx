import { formatScore, type Score } from '../../analysis/winPercent';

/** Barre d'évaluation verticale (part des blancs = Win % côté blancs). */
export function EvalBar({ winWhite, score, flipped }: { winWhite: number | null; score?: Score; flipped: boolean }) {
  const w = winWhite ?? 50;
  const text = score ? formatScore(score) : '';
  const whiteAhead = w >= 50;
  return (
    <div className={`eval-bar ${flipped ? 'flipped' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)} aria-label={`Évaluation ${text}`}>
      <div className="eval-white" style={{ height: `${w}%` }} />
      {text && <span className={`eval-text ${whiteAhead ? 'on-white' : 'on-black'}`}>{text.replace(/^\+/, '')}</span>}
    </div>
  );
}
