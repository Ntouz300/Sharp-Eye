import { useEffect } from 'react';
import { Help } from './features/help/Help';
import { Library } from './features/library/Library';
import { ReviewScreen } from './features/review/ReviewScreen';
import { useReview, type View } from './features/review/store';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { applyTheme, useSettings } from './features/settings/settings';
import { Icon } from './ui/Icon';
import { PuzzlesScreen } from './features/puzzles/PuzzlesScreen';
import { StatsScreen } from './features/stats/StatsScreen';

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'library', label: 'Bibliothèque', icon: 'library' },
  { id: 'review', label: 'Revue', icon: 'board' },
  { id: 'puzzles', label: 'Puzzles', icon: 'puzzle' },
  { id: 'stats', label: 'Progrès', icon: 'chart' },
  { id: 'settings', label: 'Réglages', icon: 'settings' },
  { id: 'help', label: 'Aide', icon: 'help' },
];

export function App() {
  const view = useReview((s) => s.view);
  const setView = useReview((s) => s.setView);
  const hasGame = useReview((s) => !!s.game);
  const puzzleTheme = useReview((s) => s.puzzleTheme);
  const theme = useSettings((s) => s.theme);
  const animations = useSettings((s) => s.animations);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle('no-anim', !animations);
  }, [animations]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./icons/icon.svg" width="28" height="28" alt="" className="brand-icon" />
          <span className="brand-name">Sharp Eye</span>
        </div>
        <nav aria-label="Navigation principale">
          {NAV.map((n) => (
            <button
              type="button"
              key={n.id}
              className={`nav-btn ${view === n.id ? 'active' : ''}`}
              aria-current={view === n.id ? 'page' : undefined}
              disabled={n.id === 'review' && !hasGame}
              onClick={() => setView(n.id)}
            >
              <Icon name={n.icon} />
              <span className="nav-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="content">
        {view === 'library' && <Library />}
        {view === 'review' && <ReviewScreen />}
        {view === 'puzzles' && <PuzzlesScreen key={puzzleTheme} initialTheme={puzzleTheme} />}
        {view === 'stats' && <StatsScreen />}
        {view === 'settings' && <SettingsScreen />}
        {view === 'help' && <Help />}
      </main>
    </div>
  );
}
