import { useEffect, useRef, useState } from 'react';
import { REVIEW_LABELS } from '../../analysis/classify';
import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { Board, type Arrow } from '../../board/Board';
import { Icon } from '../../ui/Icon';
import { useSettings } from '../settings/settings';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveDetail } from './MoveDetail';
import { MoveList } from './MoveList';
import { useReview } from './store';
import { Summary } from './Summary';

type Tab = 'summary' | 'moves';

export function ReviewScreen() {
  const { game, analysis, progress, error, ply, flipped, autoplay, errorFilter, stored } = useReview();
  const { goTo, step, flip, setAutoplay, setErrorFilter, analyze, cancel } = useReview.getState();
  const { coordinates, animations, level } = useSettings();
  const [tab, setTab] = useState<Tab>('moves');
  const [speed, setSpeed] = useState(1.2);
  // Anime la pièce seulement quand on avance d'un coup ; l'état reste stable pendant les mises à jour de l'analyse.
  const anim = useRef({ ply, forward: false });
  if (anim.current.ply !== ply) anim.current = { ply, forward: ply === anim.current.ply + 1 };

  // Lecture automatique
  useEffect(() => {
    if (!autoplay || !game) return;
    if (ply >= game.moves.length) {
      setAutoplay(false);
      return;
    }
    const t = window.setTimeout(() => step(1), speed * 1000);
    return () => window.clearTimeout(t);
  }, [autoplay, ply, game, speed, step, setAutoplay]);

  // Affiche le résumé dès la fin de l'analyse (passage de « en cours » à « terminée »).
  const wasRunning = useRef(false);
  useEffect(() => {
    if (progress) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      if (analysis?.complete) setTab('summary');
    }
  }, [progress, analysis?.complete]);
  // Partie déjà analysée à l'ouverture : on montre directement le résumé.
  useEffect(() => {
    if (useReview.getState().analysis?.complete) setTab('summary');
  }, [stored?.id]);

  const jumpError = (dir: 1 | -1) => {
    if (!game || !analysis) return;
    const ok = (i: number) =>
      REVIEW_LABELS.includes(analysis.moves[i]?.label) && (errorFilter === 'all' || game.moves[i].color === errorFilter);
    for (let p = ply + dir; p >= 1 && p <= analysis.moves.length; p += dir) {
      if (ok(p - 1)) return goTo(p);
    }
  };

  // Clavier : ← → (coup), ↑ ↓ (début/fin), F (retourner), espace (lecture)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowUp') goTo(0);
      else if (e.key === 'ArrowDown') goTo(Number.MAX_SAFE_INTEGER);
      else if (e.key === 'f' || e.key === 'F') flip();
      else if (e.key === ' ') setAutoplay(!useReview.getState().autoplay);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goTo, flip, setAutoplay]);


  if (!game || !stored) return <div className="empty-state">Choisis une partie dans la bibliothèque.</div>;

  const move = ply > 0 ? game.moves[ply - 1] : undefined;
  const moveAnalysis = ply > 0 ? analysis?.moves[ply - 1] : undefined;
  const fen = move ? move.fenAfter : game.startFen;
  const arrows: Arrow[] = [];
  if (move && moveAnalysis && !moveAnalysis.playedIsBest && moveAnalysis.bestUci && moveAnalysis.label !== 'book') {
    arrows.push({ from: moveAnalysis.bestUci.slice(0, 2), to: moveAnalysis.bestUci.slice(2, 4), kind: 'best' });
  }
  const lastMove = move ? { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) } : undefined;
  const forward = anim.current.forward;
  const winWhite = analysis?.winsWhite[ply] ?? null;
  const score = analysis?.scores[ply];
  const h = game.headers;
  const top = flipped ? { name: h.White, elo: h.WhiteElo, clock: lastClock(game.moves, ply, 'w') } : { name: h.Black, elo: h.BlackElo, clock: lastClock(game.moves, ply, 'b') };
  const bottom = flipped ? { name: h.Black, elo: h.BlackElo, clock: lastClock(game.moves, ply, 'b') } : { name: h.White, elo: h.WhiteElo, clock: lastClock(game.moves, ply, 'w') };

  return (
    <div className="review">
      <div className="board-column">
        <PlayerStrip {...top} />
        <div className="board-wrap">
          <EvalBar winWhite={winWhite} score={score} flipped={flipped} />
          <Board
            fen={fen}
            flipped={flipped}
            lastMove={lastMove}
            arrows={arrows}
            badge={moveAnalysis && lastMove ? { square: lastMove.to, label: moveAnalysis.label } : undefined}
            animateFrom={animations && forward && lastMove ? lastMove.from : undefined}
            coordinates={coordinates}
            onSwipe={(d) => step(d)}
          />
        </div>
        <PlayerStrip {...bottom} />
        <div className="controls" role="toolbar" aria-label="Navigation">
          <button type="button" className="icon-btn" onClick={() => goTo(0)} aria-label="Premier coup">
            <Icon name="first" />
          </button>
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Coup précédent">
            <Icon name="prev" />
          </button>
          <button type="button" className="icon-btn play" onClick={() => setAutoplay(!autoplay)} aria-label={autoplay ? 'Pause' : 'Lecture automatique'} aria-pressed={autoplay}>
            <Icon name={autoplay ? 'pause' : 'play'} />
          </button>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Coup suivant">
            <Icon name="next" />
          </button>
          <button type="button" className="icon-btn" onClick={() => goTo(game.moves.length)} aria-label="Dernier coup">
            <Icon name="last" />
          </button>
          <button type="button" className="icon-btn" onClick={flip} aria-label="Retourner l'échiquier">
            <Icon name="flip" />
          </button>
          <label className="speed">
            <span className="sr-only">Vitesse de lecture</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={2.5}>Lent</option>
              <option value={1.2}>Normal</option>
              <option value={0.6}>Rapide</option>
            </select>
          </label>
        </div>
      </div>

      <aside className="panel">
        {progress && (
          <div className="progress" role="status">
            <div className="progress-text">
              Analyse {REVIEW_LEVELS[analysis?.level ?? level].label.toLowerCase()} : {progress.done} / {progress.total} positions
              <button type="button" className="link-btn" onClick={cancel}>
                Arrêter
              </button>
            </div>
            <div className="progress-bar">
              <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        {!progress && analysis && !analysis.complete && (
          <div className="info-box">
            Analyse interrompue.{' '}
            <button type="button" className="link-btn" onClick={() => analyze(analysis.level)}>
              Reprendre
            </button>
          </div>
        )}
        {!progress && !analysis && (
          <div className="info-box">
            <button type="button" className="primary" onClick={() => analyze(level)}>
              Lancer la revue
            </button>
          </div>
        )}

        <EvalGraph analysis={analysis} plies={game.moves.length} ply={ply} onSelect={goTo} />

        <MoveDetail move={move} analysis={moveAnalysis} />

        <div className="error-nav">
          <button type="button" className="ghost" onClick={() => jumpError(-1)} disabled={!analysis}>
            <Icon name="prev" /> Erreur précédente
          </button>
          <select value={errorFilter} onChange={(e) => setErrorFilter(e.target.value as 'all' | 'w' | 'b')} aria-label="Filtrer les erreurs par joueur">
            <option value="all">Les deux</option>
            <option value="w">Blancs</option>
            <option value="b">Noirs</option>
          </select>
          <button type="button" className="ghost" onClick={() => jumpError(1)} disabled={!analysis}>
            Erreur suivante <Icon name="next" />
          </button>
        </div>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'summary'} onClick={() => setTab('summary')} disabled={!analysis?.complete}>
            Résumé
          </button>
          <button type="button" role="tab" aria-selected={tab === 'moves'} onClick={() => setTab('moves')}>
            Coups
          </button>
        </div>
        <div className="tab-body">
          {tab === 'summary' && analysis?.complete ? (
            <>
              <Summary game={game} analysis={analysis} onSelect={goTo} />
              <LevelPicker current={analysis.level} onPick={(l) => analyze(l)} />
            </>
          ) : (
            <MoveList moves={game.moves} analysis={analysis} ply={ply} onSelect={goTo} onSwipe={(d) => step(d)} />
          )}
        </div>
      </aside>
    </div>
  );
}

function lastClock(moves: { color: 'w' | 'b'; clock?: number }[], ply: number, color: 'w' | 'b') {
  for (let i = ply - 1; i >= 0; i--) if (moves[i].color === color) return moves[i].clock;
  return undefined;
}

function PlayerStrip({ name, elo, clock }: { name?: string; elo?: string; clock?: number }) {
  return (
    <div className="player-strip">
      <span className="strip-name">{name ?? '?'}</span>
      {elo && <span className="muted">({elo})</span>}
      {clock !== undefined && <span className="strip-clock">{formatStripClock(clock)}</span>}
    </div>
  );
}

function formatStripClock(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function LevelPicker({ current, onPick }: { current: ReviewLevel; onPick: (l: ReviewLevel) => void }) {
  return (
    <div className="level-picker">
      <span className="muted small">Niveau de revue :</span>
      {(Object.keys(REVIEW_LEVELS) as ReviewLevel[]).map((l) => (
        <button type="button" key={l} className={l === current ? 'chip active' : 'chip'} onClick={() => l !== current && onPick(l)} aria-pressed={l === current}>
          {REVIEW_LEVELS[l].label} <span className="muted small">p{REVIEW_LEVELS[l].depth}</span>
        </button>
      ))}
    </div>
  );
}
