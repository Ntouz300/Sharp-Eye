import { Chess, type Square } from 'chess.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Board, type Arrow } from '../../board/Board';
import { db, type StoredPuzzle } from '../../storage/db';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan } from '../../ui/notation';
import { useReview } from '../review/store';
import { useSettings } from '../settings/settings';
import { getProfile, recordAttempt, type PuzzleProfile } from './puzzles';

type State = 'solving' | 'solved' | 'failed';

/** Entraînement sur ses propres erreurs, avec révision espacée. */
export function PuzzlesScreen({ initialTheme }: { initialTheme?: string }) {
  const puzzles = useLiveQuery(() => db.puzzles.toArray(), [], undefined);
  const [theme, setTheme] = useState<string>(initialTheme ?? 'all');
  const [ahead, setAhead] = useState(false);
  const [current, setCurrent] = useState<StoredPuzzle | null>(null);
  const [fen, setFen] = useState('');
  const [selected, setSelected] = useState<string | undefined>();
  const [state, setState] = useState<State>('solving');
  const [last, setLast] = useState<{ from: string; to: string } | undefined>();
  const [profile, setProfile] = useState<PuzzleProfile | null>(null);
  const { coordinates, notation } = useSettings();

  useEffect(() => {
    void getProfile().then(setProfile);
  }, []);

  const now = Date.now();
  const themes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of puzzles ?? []) counts.set(p.theme, (counts.get(p.theme) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [puzzles]);
  const pool = (puzzles ?? []).filter((p) => theme === 'all' || p.theme === theme);
  const due = pool.filter((p) => p.due <= now).sort((a, b) => a.due - b.due || a.stage - b.stage);
  const queue = due.length ? due : ahead ? [...pool].sort((a, b) => a.due - b.due) : [];

  const load = (p: StoredPuzzle | undefined) => {
    setCurrent(p ?? null);
    setFen(p?.fen ?? '');
    setSelected(undefined);
    setLast(undefined);
    setState('solving');
  };

  useEffect(() => {
    if (!current && queue.length) load(queue[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, theme, ahead]);

  if (puzzles === undefined) return null;

  const header = (
    <div className="puzzle-stats">
      <div>
        <span className="stat-big">{profile?.rating ?? 1500}</span>
        <span className="muted small">classement puzzles</span>
      </div>
      <div>
        <span className="stat-big">{profile?.streak ?? 0}</span>
        <span className="muted small">jours de suite</span>
      </div>
      <div>
        <span className="stat-big">{(puzzles ?? []).filter((p) => p.due <= now).length}</span>
        <span className="muted small">à revoir aujourd'hui</span>
      </div>
      <div>
        <span className="stat-big">{puzzles.length}</span>
        <span className="muted small">puzzles au total</span>
      </div>
    </div>
  );

  const themeChips = (
    <div className="chips-row" role="radiogroup" aria-label="Thème">
      <button type="button" role="radio" aria-checked={theme === 'all'} className={`chip ${theme === 'all' ? 'active' : ''}`} onClick={() => { setTheme('all'); load(undefined); }}>
        Tous <span className="muted small">{puzzles.length}</span>
      </button>
      {themes.map(([t, n]) => (
        <button type="button" role="radio" aria-checked={theme === t} key={t} className={`chip ${theme === t ? 'active' : ''}`} onClick={() => { setTheme(t); load(undefined); }}>
          {t} <span className="muted small">{n}</span>
        </button>
      ))}
    </div>
  );

  if (!puzzles.length) {
    return (
      <div className="puzzles">
        {header}
        <p className="empty-state">
          Pas encore de puzzles. Chaque gaffe, erreur et occasion manquée de tes parties analysées devient un puzzle. Indique ton pseudo dans les Réglages pour ne garder que tes propres erreurs.
        </p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="puzzles">
        {header}
        {themeChips}
        <div className="empty-state">
          <p>Tout est révisé pour aujourd'hui. Les puzzles ratés reviennent demain, les réussis après 3, 7 puis 21 jours.</p>
          <button type="button" className="ghost" onClick={() => setAhead(true)}>
            M'entraîner quand même
          </button>
        </div>
      </div>
    );
  }

  const chess = new Chess(fen || current.fen);
  const color = new Chess(current.fen).turn();
  const solution = current.solution;
  const solutionSan = (() => {
    const c = new Chess(current.fen);
    const out: string[] = [];
    for (const u of solution.slice(0, 6)) {
      try {
        out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
      } catch {
        break;
      }
    }
    return out;
  })();

  const finish = async (success: boolean) => {
    setState(success ? 'solved' : 'failed');
    const r = await recordAttempt(current, success);
    setProfile(r.profile);
  };

  const onTap = (sq: string) => {
    if (state !== 'solving') return;
    if (selected) {
      const m = chess.moves({ square: selected as Square, verbose: true }).find((x) => x.to === sq);
      if (m) {
        const uci = m.from + m.to + (m.promotion ? 'q' : '');
        const ok = uci === solution[0] || (m.promotion && uci.slice(0, 4) === solution[0].slice(0, 4));
        chess.move({ from: m.from, to: m.to, promotion: m.promotion ? 'q' : undefined });
        setLast({ from: m.from, to: m.to });
        setSelected(undefined);
        if (ok) {
          // Joue la réponse de l'adversaire pour montrer la suite.
          const reply = solution[1];
          if (reply) {
            try {
              chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
              setLast({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
            } catch {
              /* suite absente */
            }
          }
          setFen(chess.fen());
          void finish(true);
        } else {
          // Retour à la position du puzzle pour montrer la flèche de la solution.
          setFen(current.fen);
          setLast(undefined);
          void finish(false);
        }
        return;
      }
    }
    const piece = chess.get(sq as Square);
    setSelected(piece && piece.color === chess.turn() && sq !== selected ? sq : undefined);
  };

  const arrows: Arrow[] = state === 'failed' ? [{ from: solution[0].slice(0, 2), to: solution[0].slice(2, 4), kind: 'best' }] : [];
  const targets = selected ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];
  const next = queue.find((p) => p.id !== current.id);
  const openGame = async () => {
    const g = await db.games.get(current.gameId);
    if (g) {
      await useReview.getState().openGame(g);
      useReview.getState().goTo(current.moveIndex);
    }
  };

  return (
    <div className="puzzles">
      {header}
      {themeChips}
      <div className="puzzle-layout">
        <div className="puzzle-board">
          <Board fen={fen || current.fen} flipped={color === 'b'} lastMove={last} arrows={arrows} coordinates={coordinates} onSquareTap={onTap} selected={selected} targets={targets} />
        </div>
        <div className="puzzle-side settings-card">
          <p className="puzzle-prompt">
            <span className={`turn-dot ${color}`} aria-hidden="true" /> Trouve le meilleur coup pour les {color === 'w' ? 'blancs' : 'noirs'}.
          </p>
          <p className="muted small">
            <LabelIcon label={current.label} size={16} /> Dans ta partie : {current.theme.toLowerCase()} · difficulté ≈ {current.rating} · révision {current.stage}/4
          </p>
          {state === 'solved' && (
            <div className="report ok" role="status">
              <p>
                <strong>Bravo !</strong> Suite : {solutionSan.map((s) => displaySan(s, notation)).join(' ')}
              </p>
              {current.explanation && <p className="small">{current.explanation}</p>}
            </div>
          )}
          {state === 'failed' && (
            <div className="report warn" role="status">
              <p>
                <strong>Pas tout à fait.</strong> La solution était {displaySan(solutionSan[0] ?? '', notation)} : {solutionSan.map((s) => displaySan(s, notation)).join(' ')}. Ce puzzle reviendra demain.
              </p>
              {current.explanation && <p className="small">{current.explanation}</p>}
            </div>
          )}
          <div className="import-actions">
            {state !== 'solving' && (
              <button type="button" className="primary" onClick={() => load(next)} disabled={!next}>
                {next ? 'Puzzle suivant' : 'Terminé pour aujourd’hui'}
              </button>
            )}
            {state === 'solving' && (
              <button type="button" className="ghost" onClick={() => void finish(false)}>
                Voir la solution
              </button>
            )}
            <button type="button" className="ghost" onClick={openGame}>
              Voir la partie
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
