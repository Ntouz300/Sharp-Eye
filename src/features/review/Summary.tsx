import { useRef } from 'react';
import type { GameAnalysis, Phase, PlayerSummary } from '../../analysis/analyzeGame';
import { formatAccuracy } from '../../analysis/accuracy';
import { LABEL_INFO, LABEL_ORDER, type Label } from '../../analysis/classify';
import type { ParsedGame } from '../../pgn/types';
import { SPEED_LABEL, speedOf } from '../../pgn/parser';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan } from '../../ui/notation';
import { useSettings } from '../settings/settings';

const PHASES: { id: Phase; name: string }[] = [
  { id: 'opening', name: 'Ouverture' },
  { id: 'middlegame', name: 'Milieu de partie' },
  { id: 'endgame', name: 'Finale' },
];

function initials(name: string) {
  const parts = name.replace(/[_\-.]+/g, ' ').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function PlayerCard({ name, elo, s, color }: { name: string; elo?: string; s: PlayerSummary; color: 'w' | 'b' }) {
  return (
    <div className={`player-card player-${color}`}>
      <div className="avatar" aria-hidden="true">
        {initials(name)}
      </div>
      <div className="player-name" title={name}>
        {name}
      </div>
      <div className="player-elo">{elo ? `${elo} Elo` : 'Elo inconnu'}</div>
      <div className="accuracy-big">{formatAccuracy(s.accuracy)}</div>
      <div className="accuracy-caption">précision</div>
      {s.performance !== null && (
        <div className="performance" title="Estimation déduite de la précision et de la cadence, pas un classement officiel">
          Performance ≈ {s.performance} <span className="muted">(estimation)</span>
        </div>
      )}
    </div>
  );
}

export function Summary({ game, analysis, onSelect, children }: { game: ParsedGame; analysis: GameAnalysis; onSelect: (ply: number) => void; children?: React.ReactNode }) {
  const notation = useSettings((s) => s.notation);
  const cursor = useRef<Record<string, number>>({});
  const h = game.headers;

  const cycle = (label: Label, color: 'w' | 'b') => {
    const idx = analysis.moves.map((m, i) => (m.label === label && game.moves[i].color === color ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const key = label + color;
    const k = (cursor.current[key] ?? -1) + 1;
    cursor.current[key] = k % idx.length;
    onSelect(idx[k % idx.length] + 1);
  };

  const moveText = (i: number) => {
    const m = game.moves[i];
    return `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${displaySan(m.san, notation)}`;
  };

  const speed = speedOf(h.TimeControl);
  const opening = analysis.opening;

  return (
    <div className="summary">
      <div className="players">
        <PlayerCard name={h.White ?? 'Blancs'} elo={h.WhiteElo} s={analysis.white} color="w" />
        <div className="result" aria-label={`Résultat ${game.result}`}>
          <span>{game.result.replace('1/2', '½').replace('1/2', '½')}</span>
          <span className="muted small">{SPEED_LABEL[speed]}</span>
        </div>
        <PlayerCard name={h.Black ?? 'Noirs'} elo={h.BlackElo} s={analysis.black} color="b" />
      </div>

      {children}

      <table className="label-table">
        <caption className="sr-only">Nombre de coups par étiquette</caption>
        <thead>
          <tr>
            <th scope="col">Blancs</th>
            <th scope="col" />
            <th scope="col">Noirs</th>
          </tr>
        </thead>
        <tbody>
          {LABEL_ORDER.map((label) => {
            const w = analysis.white.counts[label] ?? 0;
            const b = analysis.black.counts[label] ?? 0;
            if (w + b === 0) return null;
            return (
              <tr key={label} className={w + b === 0 ? 'zero' : ''}>
                <td>
                  <button type="button" className="count" disabled={!w} onClick={() => cycle(label, 'w')} aria-label={`${w} ${LABEL_INFO[label].name} pour les blancs : voir`}>
                    {w}
                  </button>
                </td>
                <th scope="row">
                  <LabelIcon label={label} size={18} />
                  <span>{LABEL_INFO[label].name}</span>
                </th>
                <td>
                  <button type="button" className="count" disabled={!b} onClick={() => cycle(label, 'b')} aria-label={`${b} ${LABEL_INFO[label].name} pour les noirs : voir`}>
                    {b}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <details className="fold">
        <summary>Détails : phases, ouverture, moments décisifs</summary>
        <section className="summary-section">
          <h3>Précision par phase</h3>
          <table className="phase-table">
            <tbody>
              {PHASES.map((p) => (
                <tr key={p.id}>
                  <td>{formatAccuracy(analysis.white.phases[p.id])}</td>
                  <th scope="row">{p.name}</th>
                  <td>{formatAccuracy(analysis.black.phases[p.id])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="summary-section">
          <h3>Ouverture</h3>
          <p>
            {opening ? (
              <>
                <strong>{opening.name}</strong> <span className="muted">({opening.eco})</span>
              </>
            ) : (
              (h.ECO && <span>Code {h.ECO}</span>) || <span className="muted">Ouverture non répertoriée</span>
            )}
          </p>
          <p className="muted small">
            Blancs hors théorie : {analysis.white.leftBookAt !== undefined ? moveText(analysis.white.leftBookAt) : '–'} · Noirs hors théorie :{' '}
            {analysis.black.leftBookAt !== undefined ? moveText(analysis.black.leftBookAt) : '–'}
          </p>
        </section>

        {analysis.keyMoments.length > 0 && (
          <section className="summary-section">
            <h3>Moments décisifs</h3>
            <div className="moments">
              {analysis.keyMoments.map((i) => (
                <button type="button" key={i} className="moment" onClick={() => onSelect(i + 1)}>
                  <LabelIcon label={analysis.moves[i].label} size={18} />
                  <span>{moveText(i)}</span>
                  <span className="muted small">
                    {Math.round(analysis.winsWhite[i])} % → {Math.round(analysis.winsWhite[i + 1])} %
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </details>
    </div>
  );
}
