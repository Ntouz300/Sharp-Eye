import { useEffect } from 'react';
import { Help } from './features/help/Help';
import { Library } from './features/library/Library';
import { ReviewScreen } from './features/review/ReviewScreen';
import { useReview, type View } from './features/review/store';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { applyTheme, useSettings } from './features/settings/settings';
import { Icon } from './ui/Icon';

const NAV: { id: View; label: string; icon: string }[] = [
  { id: 'library', label: 'Bibliothèque', icon: 'library' },
  { id: 'review', label: 'Revue', icon: 'board' },
  { id: 'settings', label: 'Réglages', icon: 'settings' },
  { id: 'help', label: 'Aide', icon: 'help' },
];

export function App() {
  const view = useReview((s) => s.view);
  const setView = useReview((s) => s.setView);
  const hasGame = useReview((s) => !!s.game);
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
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="14" fill="var(--accent)" />
            <path d="M22 50h20l-3-8c4-3 6-8 5-13-1-6-6-10-12-10s-11 4-12 10c-1 5 1 10 5 13z" fill="var(--accent-text)" opacity="0.92" />
            <circle cx="40" cy="22" r="5" fill="var(--accent-text)" opacity="0.6" />
          </svg>
          <span className="brand-name">Échiquier Lucide</span>
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
        {view === 'settings' && <SettingsScreen />}
        {view === 'help' && <Help />}
      </main>
    </div>
  );
}
