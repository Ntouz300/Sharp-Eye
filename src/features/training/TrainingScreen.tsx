import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { formatAccuracy } from '../../analysis/accuracy';
import { db } from '../../storage/db';
import { PuzzlesScreen } from '../puzzles/PuzzlesScreen';
import { useReview } from '../review/store';

/** Entraînement : puzzles tirés de tes erreurs (avec le défi du jour) et exercices sur une partie. */
export function TrainingScreen({ initialTheme }: { initialTheme?: string }) {
  const [part, setPart] = useState<'puzzles' | 'games'>('puzzles');
  return (
    <div className="screen training-screen">
      <header className="screen-head">
        <h1>Entraînement</h1>
        <div className="segmented" role="tablist" aria-label="Entraînement">
          <button type="button" role="tab" aria-selected={part === 'puzzles'} onClick={() => setPart('puzzles')}>
            Puzzles
          </button>
          <button type="button" role="tab" aria-selected={part === 'games'} onClick={() => setPart('games')}>
            Sur une partie
          </button>
        </div>
      </header>
      {part === 'puzzles' ? <PuzzlesScreen initialTheme={initialTheme} /> : <GameDrills />}
    </div>
  );
}

function GameDrills() {
  const games = useLiveQuery(() => db.games.orderBy('importedAt').reverse().filter((g) => g.analyzedLevel !== undefined).limit(12).toArray(), [], undefined);
  const openGame = useReview((s) => s.openGame);
  if (!games) return null;
  if (!games.length) return <p className="empty-state">Analyse une partie pour t’entraîner dessus : « Devine le coup » cache la suite et note tes choix, « Rejouer » te fait reprendre la position contre le moteur.</p>;
  return (
    <ul className="drill-list">
      {games.map((g) => (
        <li key={g.id} className="drill-row">
          <span className="drill-title">
            {g.white} – {g.black}
            <span className="muted small">
              {' '}
              · {formatAccuracy(g.accuracyWhite)} / {formatAccuracy(g.accuracyBlack)}
            </span>
          </span>
          <span className="drill-actions">
            <button type="button" className="ghost" onClick={() => void openGame(g, { stage: 'moves', mode: 'guess' })}>
              Devine le coup
            </button>
            <button type="button" className="ghost" onClick={() => void openGame(g, { stage: 'moves', mode: 'play' })}>
              Rejouer
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
}
