import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { formatAccuracy } from '../../analysis/accuracy';
import { db } from '../../storage/db';
import { dayKey } from '../progress/achievements';
import { allChallenges, dailyChallenge, getLevel, getLog, loadBank, THEMES, weakestTheme, weekStart } from '../puzzles/bank';
import { fromStored, pickBank, type Challenge, type Level } from '../puzzles/challenge';
import { ChallengePlayer } from '../puzzles/ChallengePlayer';
import { getProfile, migratePuzzles, playable } from '../puzzles/puzzles';
import { useReview } from '../review/store';

/** Une série de défis : une file fixe (défi du jour puis révisions) ou un thème au niveau adaptatif. */
interface Session {
  title: string;
  queue: Challenge[];
  /** Thème choisi : quand la file est vide, le défi suivant est pris dans la banque au niveau du moment. */
  theme?: string | null;
  dailyId?: string;
}

/** Entraînement : ce qu'il y a à faire aujourd'hui, les défis par thème, tes parties et ta progression. */
export function TrainingScreen({ initialTheme }: { initialTheme?: string }) {
  const stored = useLiveQuery(() => db.puzzles.toArray(), [], undefined);
  const daily = useLiveQuery(() => db.kv.get('daily'), [], undefined)?.value as { day: string; count: number; success: boolean } | undefined;
  const games = useLiveQuery(() => db.games.orderBy('importedAt').reverse().filter((g) => g.analyzedLevel !== undefined).limit(12).toArray(), [], undefined);
  const [bank, setBank] = useState<Challenge[] | null>(null);
  // Niveau, série et réussites de la semaine : relus dès qu'un défi est enregistré.
  const level = useLiveQuery(getLevel, [], null as Level | null);
  const extra = useLiveQuery(
    async () => {
      const [p, log] = await Promise.all([getProfile(), getLog()]);
      const since = weekStart();
      return { streak: p.streak, week: log.filter((e) => e.success && e.t >= since).length };
    },
    [],
    { streak: 0, week: 0 },
  );
  const [session, setSession] = useState<Session | null>(null);
  const [current, setCurrent] = useState<Challenge | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    void migratePuzzles();
    void loadBank().then(setBank);
  }, []);

  const all = useMemo(() => (stored && bank ? allChallenges(stored, bank) : []), [stored, bank]);
  const now = Date.now();
  const due = (stored ?? []).filter((p) => playable(p) && p.due <= now && (p.label !== 'bank' || p.attempts > 0)).sort((a, b) => a.due - b.due).map(fromStored);
  const today = level ? dailyChallenge(all, level) : undefined;
  const dailyDone = daily?.day === dayKey();

  const next = (s: Session, skip?: string): Challenge | undefined => {
    const seen = new Set(done);
    if (skip) seen.add(skip);
    const q = s.queue.find((c) => !seen.has(c.id));
    if (q || s.theme === undefined || !level) return q;
    const pool = all.filter((c) => !s.theme || c.theme === s.theme);
    return pickBank(pool, level, null, seen);
  };

  const start = (s: Session) => {
    const first = next(s);
    if (!first) return;
    setSession(s);
    setCurrent(first);
  };
  const startTheme = (theme: string | null) => {
    const own = due.filter((c) => c.theme === theme);
    start({ title: theme ?? 'Défis', queue: own, theme });
  };

  // Lien « S'entraîner » depuis Progrès : ouvre directement les défis du thème.
  useEffect(() => {
    if (initialTheme && bank && level && stored && !session) startTheme(initialTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTheme, bank, level, stored]);

  if (session && current) {
    const after = next(session, current.id);
    return (
      <div className="screen training-screen">
        <header className="screen-head">
          <button
            type="button"
            className="back-btn"
            onClick={() => {
              setSession(null);
              setCurrent(null);
            }}
          >
            ← Entraînement
          </button>
          <h1 className="session-title">{session.title}</h1>
        </header>
        <ChallengePlayer
          key={current.id}
          challenge={current}
          daily={current.id === session.dailyId}
          nextLabel={after ? 'Défi suivant' : 'Terminer'}
          onNext={() => {
            setDone((d) => new Set(d).add(current.id));
            if (after) setCurrent(after);
            else {
              setSession(null);
              setCurrent(null);
            }
          }}
        />
      </div>
    );
  }

  if (!stored || !bank) return <div className="screen training-screen" />;

  const todayQueue = [...(today && !dailyDone ? [today] : []), ...due.filter((c) => c.id !== today?.id)];
  const own = stored.filter((p) => p.label !== 'bank' && playable(p)).map(fromStored);
  const themeStats = THEMES.map((t) => {
    const list = all.filter((c) => c.theme === t);
    const tried = stored.filter((p) => p.theme === t && p.attempts > 0);
    const attempts = tried.reduce((a, p) => a + p.attempts, 0);
    const successes = tried.reduce((a, p) => a + p.successes, 0);
    return { theme: t, count: list.length, rate: attempts ? successes / attempts : null };
  }).filter((t) => t.count > 0);
  const weak = weakestTheme(stored);
  const openGame = useReview.getState().openGame;
  const lastGame = games?.[0];

  return (
    <div className="screen training-screen">
      <header className="screen-head">
        <h1>Entraînement</h1>
        {level && <span className="muted small">Niveau des défis ≈ {level.rating}</span>}
      </header>
      <div className="training-home">
        <section className="settings-card home-card home-today" data-testid="today">
          <h2>À faire aujourd’hui</h2>
          <p className="muted small">Le défi du jour, puis les défis à revoir.</p>
          <div className="today-row">
            <div>
              <strong>{dailyDone ? (daily?.success ? 'Défi du jour réussi' : 'Défi du jour tenté') : 'Défi du jour'}</strong>
              <span className="muted small">
                {' '}
                · {due.length} à revoir
              </span>
            </div>
            <button
              type="button"
              className="primary"
              disabled={!todayQueue.length}
              onClick={() => start({ title: 'Aujourd’hui', queue: todayQueue, dailyId: dailyDone ? undefined : today?.id })}
            >
              {todayQueue.length ? 'Commencer' : 'Tout est fait'}
            </button>
          </div>
        </section>

        <section className="settings-card home-card home-themes" data-testid="themes">
          <h2>Défis par thème</h2>
          <p className="muted small">Des combinaisons de 2 à 5 coups, à ton niveau.</p>
          <div className="theme-tiles">
            {themeStats.map((t) => (
              <button type="button" key={t.theme} className="theme-tile" onClick={() => startTheme(t.theme)}>
                <strong>{t.theme}</strong>
                <span className="muted small">
                  {t.count} défi{t.count > 1 ? 's' : ''} · {t.rate === null ? 'pas encore tenté' : `${Math.round(t.rate * 100)} % réussis`}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card home-card home-games" data-testid="games">
          <h2>Sur mes parties</h2>
          <p className="muted small">Tes erreurs en défis, ou ta dernière partie analysée.</p>
          {lastGame ? (
            <>
              <div className="theme-tiles">
                <button type="button" className="theme-tile" disabled={!own.length} onClick={() => start({ title: 'Mes erreurs', queue: [...own].sort((a, b) => a.rating - b.rating) })}>
                  <strong>Mes erreurs</strong>
                  <span className="muted small">{own.length ? `${own.length} défi${own.length > 1 ? 's' : ''} tirés de tes parties` : 'aucune erreur à rejouer'}</span>
                </button>
                <button type="button" className="theme-tile" onClick={() => void openGame(lastGame, { stage: 'moves', mode: 'guess' })}>
                  <strong>Devine le coup</strong>
                  <span className="muted small">
                    {lastGame.white} – {lastGame.black}
                  </span>
                </button>
                <button type="button" className="theme-tile" onClick={() => void openGame(lastGame, { stage: 'moves', mode: 'play' })}>
                  <strong>Rejouer contre le moteur</strong>
                  <span className="muted small">depuis ta dernière partie</span>
                </button>
              </div>
              {games.length > 1 && (
                <details className="fold">
                  <summary>Choisir une autre partie</summary>
                  <ul className="drill-list">
                    {games.slice(1).map((g) => (
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
                </details>
              )}
            </>
          ) : (
            <div className="today-row">
              <p className="small">Analyse une partie pour t’entraîner sur tes propres erreurs.</p>
              <button type="button" className="primary" onClick={() => useReview.getState().setTab('games')}>
                Analyser une partie
              </button>
            </div>
          )}
        </section>
        <section className="settings-card home-card home-progress" data-testid="progress">
          <h2>Ma progression</h2>
          <p className="muted small">Ta régularité et ce qui reste à travailler.</p>
          <div className="mini-stats">
            <div>
              <span className="stat-big">{extra.streak}</span>
              <span className="muted small">jours de suite</span>
            </div>
            <div>
              <span className="stat-big">{extra.week}</span>
              <span className="muted small">réussis cette semaine</span>
            </div>
          </div>
          <div className="import-actions">
            {weak && (
              <button type="button" className="ghost" onClick={() => startTheme(weak.theme)}>
                Thème faible : {weak.theme} ({Math.round(weak.rate * 100)} %)
              </button>
            )}
            <button type="button" className="link-btn" onClick={() => useReview.getState().setTab('progress')}>
              Voir mes progrès
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
