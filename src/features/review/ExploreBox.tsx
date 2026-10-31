import type { MoveAnalysis } from '../../analysis/analyzeGame';
import { LABEL_INFO, type Label } from '../../analysis/classify';
import { formatScore } from '../../analysis/winPercent';
import type { PositionEval } from '../../engine/types';
import type { MoveNode } from '../../pgn/types';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan } from '../../ui/notation';
import { sanLine } from '../puzzles/ChallengePlayer';
import { useSettings } from '../settings/settings';

interface Tried {
  san: string;
  uci: string;
  fen: string;
}

/**
 * Exploration : chaque coup essayé est évalué et classé comme un coup de la partie,
 * comparé au coup réellement joué, avec le meilleur coup et la suite du moteur. Rien n'est enregistré.
 */
export function ExploreBox(props: {
  start: string;
  moves: Tried[];
  evals: Record<string, PositionEval>;
  labels: (Label | undefined)[];
  gameMove?: MoveNode;
  gameAnalysis?: MoveAnalysis;
  after?: string;
  onUndo: () => void;
  onBack: () => void;
}) {
  const { start, moves, evals, labels, gameMove, gameAnalysis, after, onUndo, onBack } = props;
  const notation = useSettings((s) => s.notation);
  const last = moves[moves.length - 1];
  const prevFen = moves.length > 1 ? moves[moves.length - 2].fen : start;
  const before = evals[prevFen];
  const now = evals[last.fen];
  const label = labels[labels.length - 1];
  const bestUci = before?.lines[0]?.pv[0];
  const bestSan = bestUci && bestUci !== last.uci ? sanLine(prevFen, [bestUci])[0] : undefined;
  const pv = now ? sanLine(last.fen, now.lines[0]?.pv.slice(0, 6) ?? []) : [];
  const first = labels[0];
  return (
    <div className="explore-box" aria-live="polite" data-testid="explore-box">
      <div className="detail-head">
        {label ? <LabelIcon label={label} size={22} /> : null}
        <strong>
          Essai : {displaySan(last.san, notation)}
          {label ? ` : ${LABEL_INFO[label].name}` : ''}
        </strong>
        <span className="detail-eval" title="Évaluation avant → après le coup essayé (côté blancs)">
          {before && now ? `${formatScore(before.lines[0].score)} → ${formatScore(now.lines[0]?.score ?? before.lines[0].score)}` : 'calcul…'}
        </span>
      </div>
      <p className="detail-text">
        {after ? `Après ${after} : ` : 'Depuis le départ : '}
        <span className="tried-moves">
          {moves.map((m, i) => (
            <span key={i}>
              {labels[i] && <LabelIcon label={labels[i]!} size={14} />} {displaySan(m.san, notation)}{' '}
            </span>
          ))}
        </span>
      </p>
      {bestSan && label && label !== 'best' && (
        <p className="detail-text">
          Le meilleur coup était <strong>{displaySan(bestSan, notation)}</strong>.
        </p>
      )}
      {pv.length > 0 && (
        <p className="detail-text pv" data-testid="explore-pv">
          Suite du moteur : {pv.map((s) => displaySan(s, notation)).join(' ')}
        </p>
      )}
      {gameMove && gameAnalysis && first && moves.length >= 1 && (
        <p className="detail-text muted small" data-testid="explore-compare">
          Dans la partie : {displaySan(gameMove.san, notation)}, {LABEL_INFO[gameAnalysis.label].name.toLowerCase()} ({formatScore(gameAnalysis.scoreAfter)}). Ton essai {displaySan(moves[0].san, notation)} : {LABEL_INFO[first].name.toLowerCase()}
          {evals[moves[0].fen] ? ` (${formatScore(evals[moves[0].fen].lines[0]?.score ?? { cp: 0 })})` : ''}.
        </p>
      )}
      <p className="muted small">Exploration seulement : ta partie et ton historique ne changent pas.</p>
      <div className="explore-actions">
        <button type="button" className="ghost" onClick={onUndo}>
          Annuler le coup
        </button>
        <button type="button" className="primary" onClick={onBack}>
          Revenir à la partie
        </button>
      </div>
    </div>
  );
}
