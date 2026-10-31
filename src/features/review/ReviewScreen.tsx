import { Chess, type Square } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import { winWhite as winWhite_ } from '../../analysis/analyzeGame';
import { formatScore } from '../../analysis/winPercent';
import { useLiveEngine } from '../../engine/useLiveEngine';
import { exportAnnotatedPgn } from '../../analysis/pgnExport';
import { boardToPng } from '../../board/exportImage';
import { safeFilename, shareOrDownload } from '../../ui/share';
import { displaySan } from '../../ui/notation';
import { REVIEW_LABELS } from '../../analysis/classify';
import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { Board, type Arrow } from '../../board/Board';
import { Board3D } from '../../board/Board3D';
import { Icon } from '../../ui/Icon';
import { useSettings } from '../settings/settings';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveDetail } from './MoveDetail';
import { MoveList } from './MoveList';
import { useReview } from './store';
import { Summary } from './Summary';
import { TimeGraph } from './TimeGraph';
import { LABEL_INFO } from '../../analysis/classify';
import { speak, speechAvailable, spokenSan, stopSpeaking } from '../../ui/speech';
import { GuessMode, PlayMode } from './TrainingModes';

type Tab = 'summary' | 'moves';

export function ReviewScreen() {
  const { game, analysis, progress, error, ply, flipped, autoplay, errorFilter, stored } = useReview();
  const { goTo, step, flip, setAutoplay, setErrorFilter, analyze, cancel } = useReview.getState();
  const { coordinates, animations, level, notation, narration, board3d } = useSettings();
  const [presenting, setPresenting] = useState(false);
  const speech = useRef<Promise<void>>(Promise.resolve());
  const [tab, setTab] = useState<Tab>('moves');
  const [speed, setSpeed] = useState(1.2);
  const [graph, setGraph] = useState<'eval' | 'time'>('eval');
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<null | 'guess-w' | 'guess-b' | 'play'>(null);
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
    // Avec la narration, le coup suivant attend la fin de la lecture.
    let cancelled = false;
    let t = 0;
    const wait = narration ? speech.current : Promise.resolve();
    void wait.then(() => {
      if (!cancelled) t = window.setTimeout(() => step(1), narration ? 500 : speed * 1000);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [autoplay, ply, game, speed, step, setAutoplay, narration]);

  // Narration : lit le coup, son étiquette et l'explication.
  useEffect(() => {
    if (!narration || !game || ply === 0) return;
    const m = game.moves[ply - 1];
    const a = analysis?.moves[ply - 1];
    const parts = [`${m.color === 'w' ? m.moveNumber + '.' : ''} ${spokenSan(m.san)}`];
    if (a) {
      parts.push(LABEL_INFO[a.label].name);
      if (a.explanation && !['best', 'book', 'forced'].includes(a.label)) parts.push(a.explanation);
    }
    speech.current = speak(parts.join('. '));
  }, [narration, ply, game, analysis]);
  useEffect(() => () => stopSpeaking(), []);

  // Mode présentation : plein écran, échiquier agrandi, seul le commentaire du coup reste visible.
  useEffect(() => {
    document.body.classList.toggle('presenting', presenting);
    if (!presenting) return;
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setPresenting(false);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.classList.remove('presenting');
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, [presenting]);

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

  // Mode Explorer : variante jouée par l'utilisateur depuis la position affichée, sans toucher à la partie.
  const [explore, setExplore] = useState<ExploreMove[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [linesOpen, setLinesOpen] = useState(false);
  const [multiPv, setMultiPv] = useState(3);
  const [shownBest, setShownBest] = useState(0);
  useEffect(() => {
    setExplore([]);
    setSelected(undefined);
  }, [ply, stored?.id]);
  const gameFen = game ? (ply > 0 ? game.moves[ply - 1].fenAfter : game.startFen) : null;
  const displayFen = explore.length ? explore[explore.length - 1].fen : gameFen;
  const live = useLiveEngine(explore.length || linesOpen || shownBest ? displayFen : null, 18, explore.length && !linesOpen && !shownBest ? 1 : Math.max(multiPv, shownBest));

  const onSquareTap = (sq: string) => {
    if (!displayFen) return;
    const chess = new Chess(displayFen);
    if (selected) {
      const legal = chess.moves({ square: selected as Square, verbose: true });
      const m = legal.find((x) => x.to === sq);
      if (m) {
        const mv = chess.move({ from: m.from, to: m.to, promotion: m.promotion ? 'q' : undefined });
        setExplore([...explore, { san: mv.san, uci: mv.from + mv.to + (mv.promotion ?? ''), fen: chess.fen() }]);
        setSelected(undefined);
        return;
      }
    }
    const piece = chess.get(sq as Square);
    setSelected(piece && piece.color === chess.turn() && sq !== selected ? sq : undefined);
  };

  // Clavier : ← → (coup), ↑ ↓ (début/fin), F (retourner), espace (lecture), 1 à 3 (meilleurs coups)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode) return;
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (['1', '2', '3'].includes(e.key)) setShownBest((n) => (n === Number(e.key) ? 0 : Number(e.key)));
      else if (e.key === 'Escape') setShownBest(0);
      else if (e.key === 'ArrowUp') goTo(0);
      else if (e.key === 'ArrowDown') goTo(Number.MAX_SAFE_INTEGER);
      else if (e.key === 'f' || e.key === 'F') flip();
      else if (e.key === ' ') setAutoplay(!useReview.getState().autoplay);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goTo, flip, setAutoplay, mode]);


  if (!game || !stored) return <div className="empty-state">Choisis une partie dans la bibliothèque.</div>;

  const hasClock = game.moves.some((m) => m.clock !== undefined);
  const move = ply > 0 ? game.moves[ply - 1] : undefined;
  const moveAnalysis = ply > 0 ? analysis?.moves[ply - 1] : undefined;
  const exploring = explore.length > 0;
  const fen = displayFen ?? game.startFen;
  const lastExplore = exploring ? explore[explore.length - 1] : undefined;
  const arrows: Arrow[] = [];
  if (shownBest && live.result) {
    for (const l of live.result.lines.slice(0, shownBest)) if (l.pv[0]) arrows.push({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), kind: 'best' });
  } else if (!exploring && move && moveAnalysis && !moveAnalysis.playedIsBest && moveAnalysis.bestUci && moveAnalysis.label !== 'book') {
    arrows.push({ from: moveAnalysis.bestUci.slice(0, 2), to: moveAnalysis.bestUci.slice(2, 4), kind: 'best' });
  }
  const playedMove = move ? { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) } : undefined;
  const lastMove = lastExplore ? { from: lastExplore.uci.slice(0, 2), to: lastExplore.uci.slice(2, 4) } : playedMove;
  const targets = selected ? new Chess(fen).moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];
  const liveScore = live.result?.lines[0]?.score;
  const forward = anim.current.forward;
  const winWhite = exploring ? (liveScore ? winWhite_(liveScore) : null) : (analysis?.winsWhite[ply] ?? null);
  const score = exploring ? liveScore : analysis?.scores[ply];
  const h = game.headers;
  const top = flipped ? { name: h.White, elo: h.WhiteElo, clock: lastClock(game.moves, ply, 'w') } : { name: h.Black, elo: h.BlackElo, clock: lastClock(game.moves, ply, 'b') };
  const bottom = flipped ? { name: h.Black, elo: h.BlackElo, clock: lastClock(game.moves, ply, 'b') } : { name: h.White, elo: h.WhiteElo, clock: lastClock(game.moves, ply, 'w') };

  if (mode === 'play') return <PlayMode startFen={fen} onExit={() => setMode(null)} />;
  if (mode === 'guess-w' || mode === 'guess-b')
    return (
      <GuessMode
        game={game}
        analysis={analysis}
        startPly={ply}
        side={mode === 'guess-w' ? 'w' : 'b'}
        onExit={(p) => {
          setMode(null);
          goTo(p);
        }}
      />
    );

  return (
    <div className={`review ${presenting ? 'presenting' : ''}`}>
      <div className="board-column">
        <PlayerStrip {...top} />
        <div className="board-wrap">
          <EvalBar winWhite={winWhite} score={score} flipped={flipped} />
          {board3d ? (
            <Board3D fen={fen} flipped={flipped} lastMove={lastMove} arrows={arrows} onSquareTap={onSquareTap} selected={selected} targets={targets} />
          ) : (
            <Board
              fen={fen}
              flipped={flipped}
              lastMove={lastMove}
              arrows={arrows}
              badge={!exploring && moveAnalysis && lastMove ? { square: lastMove.to, label: moveAnalysis.label } : undefined}
              animateFrom={animations && (forward || exploring) && lastMove ? lastMove.from : undefined}
              coordinates={coordinates}
              onSwipe={(d) => (exploring ? (d < 0 ? setExplore(explore.slice(0, -1)) : undefined) : step(d))}
              onSquareTap={onSquareTap}
              selected={selected}
              targets={targets}
            />
          )}
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
          <button type="button" className="icon-btn" onClick={() => setPresenting(!presenting)} aria-label={presenting ? 'Quitter la présentation' : 'Mode présentation'} aria-pressed={presenting}>
            <Icon name={presenting ? 'close' : 'expand'} />
          </button>
          {speechAvailable() && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                if (narration) stopSpeaking();
                useSettings.getState().set({ narration: !narration });
              }}
              aria-label={narration ? 'Couper la narration' : 'Narration à voix haute'}
              aria-pressed={narration}
            >
              <Icon name={narration ? 'speaker' : 'mute'} />
            </button>
          )}
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

        {hasClock && (
          <div className="graph-switch" role="tablist" aria-label="Graphique">
            <button type="button" role="tab" aria-selected={graph === 'eval'} onClick={() => setGraph('eval')}>
              Évaluation
            </button>
            <button type="button" role="tab" aria-selected={graph === 'time'} onClick={() => setGraph('time')}>
              Temps
            </button>
          </div>
        )}
        {graph === 'time' && hasClock ? (
          <TimeGraph moves={game.moves} timeControl={game.headers.TimeControl} ply={ply} onSelect={goTo} />
        ) : (
          <EvalGraph analysis={analysis} plies={game.moves.length} ply={ply} onSelect={goTo} />
        )}

        {exploring ? (
          <div className="explore-box" aria-live="polite">
            <div className="detail-head">
              <strong>Exploration</strong>
              <span className="detail-eval">{live.loading ? 'calcul…' : liveScore ? formatScore(liveScore) : ''}</span>
            </div>
            <p className="detail-text">
              {move ? `Après ${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${displaySan(move.san, notation)} : ` : 'Depuis le départ : '}
              <strong>{explore.map((m) => displaySan(m.san, notation)).join(' ')}</strong>
            </p>
            <div className="explore-actions">
              <button type="button" className="ghost" onClick={() => setExplore(explore.slice(0, -1))}>
                Annuler le coup
              </button>
              <button type="button" className="primary" onClick={() => setExplore([])}>
                Revenir à la partie
              </button>
            </div>
          </div>
        ) : (
          <MoveDetail move={move} analysis={moveAnalysis} />
        )}

        <details className="engine-lines" open={linesOpen} onToggle={(e) => setLinesOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            Lignes du moteur <span className="muted small">(touche une pièce pour explorer · 1 à 3 : flèches)</span>
          </summary>
          {linesOpen && (
            <div className="lines-body">
              <label className="small muted">
                Nombre de lignes{' '}
                <select value={multiPv} onChange={(e) => setMultiPv(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {live.loading && <p className="muted small">Calcul en profondeur 18…</p>}
              {live.result?.lines.map((l) => (
                <p key={l.multipv} className="engine-line">
                  <span className="line-score">{formatScore(l.score)}</span>
                  <span>{pvToSan(fen, l.pv, 10).map((x) => displaySan(x, notation)).join(' ')}</span>
                </p>
              ))}
            </div>
          )}
        </details>

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

        <div className="training-row">
          <button type="button" className="ghost" onClick={() => { setExplore([]); setMode(flipped ? 'guess-b' : 'guess-w'); }}>
            Devine le coup ({flipped ? 'noirs' : 'blancs'})
          </button>
          <button type="button" className="ghost" onClick={() => setMode('play')}>
            Rejouer contre le moteur
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
              <div className="export-row">
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    const pgn = exportAnnotatedPgn(game, analysis, analysis.evals ?? []);
                    const r = await shareOrDownload(new Blob([pgn], { type: 'application/x-chess-pgn' }), `${safeFilename(`${h.White ?? 'blancs'}-${h.Black ?? 'noirs'}`)}.pgn`, 'Partie annotée');
                    setNotice(r === 'downloaded' ? 'PGN annoté téléchargé.' : r === 'shared' ? 'PGN annoté partagé.' : null);
                  }}
                >
                  <Icon name="upload" /> PGN annoté
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={async () => {
                    const svg = document.querySelector<SVGSVGElement>('svg.board');
                    if (!svg) return;
                    try {
                      const png = await boardToPng(svg);
                      const r = await shareOrDownload(png, `${safeFilename(`position-${ply}`)}.png`, 'Position');
                      setNotice(r === 'downloaded' ? 'Image téléchargée.' : r === 'shared' ? 'Image partagée.' : null);
                    } catch (e) {
                      setNotice((e as Error).message);
                    }
                  }}
                >
                  <Icon name="board" /> Image de la position
                </button>
              </div>
              {notice && <p className="muted small export-notice">{notice}</p>}
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

interface ExploreMove {
  san: string;
  uci: string;
  fen: string;
}

function pvToSan(fen: string, pv: string[], max: number): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
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
