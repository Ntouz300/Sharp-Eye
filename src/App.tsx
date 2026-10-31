import { useEffect } from 'react';
import { useSync } from './features/account/chesscom';
import { GamesScreen } from './features/library/GamesScreen';
import { ProfileScreen } from './features/profile/ProfileScreen';
import { ReviewScreen } from './features/review/ReviewScreen';
import { useReview, type Tab } from './features/review/store';
import { applyTheme, useSettings } from './features/settings/settings';
import { StatsScreen } from './features/stats/StatsScreen';
import { TrainingScreen } from './features/training/TrainingScreen';
import { Icon } from './ui/Icon';
import { useToast } from './ui/toast';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'games', label: 'Parties', icon: 'games' },
  { id: 'training', label: 'Entraînement', icon: 'training' },
  { id: 'progress', label: 'Progrès', icon: 'chart' },
  { id: 'profile', label: 'Profil', icon: 'user' },
];

export function App() {
  const tab = useReview((s) => s.tab);
  const setTab = useReview((s) => s.setTab);
  const reviewOpen = useReview((s) => s.reviewOpen);
  const puzzleTheme = useReview((s) => s.puzzleTheme);
  const theme = useSettings((s) => s.theme);
  const animations = useSettings((s) => s.animations);
  const toast = useToast((s) => s.message);

  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    document.documentElement.classList.toggle('no-anim', !animations);
  }, [animations]);

  // Synchro du compte chess.com : à l'ouverture et à chaque retour au premier plan.
  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === 'visible') void useSync.getState().sync();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('online', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
    };
  }, []);

  return (
    <div className={`app ${reviewOpen ? 'review-open' : ''}`}>
      <main className="content" aria-hidden={reviewOpen || undefined}>
        {tab === 'games' && <GamesScreen />}
        {tab === 'training' && <TrainingScreen key={puzzleTheme} initialTheme={puzzleTheme} />}
        {tab === 'progress' && <StatsScreen />}
        {tab === 'profile' && <ProfileScreen />}
      </main>
      <nav className="tabbar" aria-label="Navigation principale" aria-hidden={reviewOpen || undefined}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            aria-label={t.label}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={22} />
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>
      {reviewOpen && <ReviewScreen />}
      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}
