import { frenchName } from '../theory/names';
import type { MoveAnalysis } from '../../analysis/analyzeGame';
import { LABEL_INFO, REVIEW_LABELS } from '../../analysis/classify';
import { formatScore } from '../../analysis/winPercent';
import type { MoveNode } from '../../pgn/types';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan } from '../../ui/notation';
import { useSettings } from '../settings/settings';

const PRAISE: Partial<Record<string, string>> = {
  brilliant: 'Sacrifice brillant : le moteur confirme que ce coup est le meilleur.',
  great: 'Seul bon coup de la position, bien trouvé.',
  best: 'Premier choix du moteur.',
  book: 'Coup de la théorie des ouvertures.',
  forced: 'Seul coup légal.',
};

/** Encadré du coup affiché : étiquette, évaluation avant/après, meilleur coup et ligne du moteur. */
/** Ouverture précise en tête du commentaire : sur les coups théoriques et le premier coup hors théorie. */
export function openingLine(opening: { eco: string; name: string } | undefined, label: string | undefined, leftBook: boolean): string | null {
  if (!opening) return null;
  if (label === 'book') return `${frenchName(opening.name)} (${opening.eco})`;
  if (leftBook) return `Sortie de la théorie : ${frenchName(opening.name)} (${opening.eco})`;
  return null;
}

export function MoveDetail({ move, analysis, opening }: { move?: MoveNode; analysis?: MoveAnalysis; opening?: string | null }) {
  const notation = useSettings((s) => s.notation);
  if (!move) return <div className="move-detail muted">Position de départ. Avance d'un coup avec → ou en glissant sur l'échiquier.</div>;
  const san = `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${displaySan(move.san, notation)}`;
  if (!analysis) return <div className="move-detail"><strong>{san}</strong> <span className="muted">· analyse en cours…</span></div>;

  const review = REVIEW_LABELS.includes(analysis.label);
  const loss = Math.max(0, analysis.winBefore - analysis.winAfter);
  return (
    <div className={`move-detail label-${analysis.label}`} aria-live="polite">
      <div className="detail-head">
        <LabelIcon label={analysis.label} size={22} />
        <strong>
          {san} : {LABEL_INFO[analysis.label].name}
        </strong>
        <span className="detail-eval" title="Évaluation avant → après le coup (côté blancs)">
          {formatScore(analysis.scoreBefore)} → {formatScore(analysis.scoreAfter)}
        </span>
      </div>
      {opening && (
        <p className="detail-opening" data-testid="detail-opening">
          {opening}
        </p>
      )}
      {PRAISE[analysis.label] && <p className="detail-text">{PRAISE[analysis.label]}</p>}
      {analysis.explanation && <p className="detail-text explanation">{analysis.explanation}</p>}
      {!analysis.playedIsBest && analysis.bestSan && analysis.label !== 'book' && analysis.label !== 'forced' && (
        <p className="detail-text">
          {review ? `Chances de gain : −${loss.toFixed(0)} points. ` : ''}
          Le meilleur coup était <strong>{displaySan(analysis.bestSan, notation)}</strong>
          {analysis.bestLine.length > 1 && (
            <span className="pv">
              {' '}
              : {analysis.bestLine.slice(0, 8).map((s) => displaySan(s, notation)).join(' ')}
            </span>
          )}
        </p>
      )}
      {move.comment && <p className="detail-comment">« {move.comment} »</p>}
    </div>
  );
}
