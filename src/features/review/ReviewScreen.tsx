import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { winWhite as winWhite_ } from '../../analysis/analyzeGame';
import { LABEL_INFO, REVIEW_LABELS } from '../../analysis/classify';
import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { exportAnnotatedPgn } from '../../analysis/pgnExport';
import { formatScore } from '../../analysis/winPercent';
import { Board, type Arrow } from '../../board/Board';
import { Board3D } from '../../board/Board3D';
import { boardToPng } from '../../board/exportImage';
import { useLiveEngine } from '../../engine/useLiveEngine';
import type { ParsedGame } from '../../pgn/types';
import { Icon } from '../../ui/Icon';
import { displaySan } from '../../ui/notation';
import { safeFilename, shareOrDownload } from '../../ui/share';
import { MenuSheet, Sheet, type MenuItem } from '../../ui/Sheet';
import { useToast } from '../../ui/toast';
import { speak, speechAvailable, spokenSan, stopSpeaking } from '../../ui/speech';
import { useSettings } from '../settings/settings';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveDetail } from './MoveDetail';
import { MoveList } from './MoveList';
import { DEEP_DEPTH, useReview } from './store';
import { Summary } from './Summary';
import { TimeGraph } from './TimeGraph';
import { GuessMode, PlayMode } from './TrainingModes';

const SPEEDS: [number, string][] = [
  [2.5, 'Lente'],
  [1.2, 'Normale'],
  [0.6, 'Rapide'],
];

type DeepTab = 'engine' | 'moves' | 'time' | 'numbers';

/**
 * Revue d'une partie, ouverte par-dessus la bibliothèque, en trois temps :
 * l'aperçu (précisions, graphique, étiquettes), le coup par coup, et la feuille « Approfondir ».
 */
export function ReviewScreen() {
  const { game, stored, analysis, stage, trainingMode, ply, flipped } = useReview();
  const { closeReview, setStage, setTrainingMode, goTo } = useReview.getState();

  // Fin d'une analyse lancée à l'ouverture : l'aperçu s'affiche si l'on n'a pas encore avancé dans la partie.
  const progress = useReview((s) => s.progress);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (progress) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      if (analysis?.complete && useReview.getState().ply === 0) setStage('overview');
    }
  }, [progress, analysis?.complete, setStage]);

  if (!game || !stored) return null;
  const title = `${game.headers.White ?? 'Blancs'} – ${game.headers.Black ?? 'Noirs'}`;

  if (trainingMode) {
    const back = () => setTrainingMode(null);
    return (
      <div className="rv rv-training">
        <TopBar title={trainingMode === 'play' ? 'Rejouer contre le moteur' : 'Devine le coup'} onBack={back} backLabel="Revue" />
        {trainingMode === 'play' ? (
          <PlayMode startFen={ply > 0 ? game.moves[ply - 1].fenAfter : game.startFen} onExit={back} />
        ) : (
          <GuessMode
            game={game}
            analysis={analysis}
            startPly={ply}
            side={flipped ? 'b' : 'w'}
            onExit={(p) => {
              back();
              goTo(p);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label={`Revue : ${title}`}>
      {stage === 'overview' && analysis?.complete ? <Overview game={game} title={title} onBack={closeReview} /> : <MovesView game={game} title={title} onBack={closeReview} />}
    </div>
  );
}

function TopBar({ title, onBack, backLabel = 'Parties', onMore, subtitle }: { title: string; onBack: () => void; backLabel?: string; onMore?: () => void; subtitle?: string }) {
  return (
    <header className="rv-top">
      <button type="button" className="back-btn" onClick={onBack} aria-label={`Retour : ${backLabel}`}>
        <Icon name="back" />
        <span>{backLabel}</span>
      </button>
      <div className="rv-title">
        <span className="rv-title-main">{title}</span>
        {subtitle && <span className="rv-title-sub">{subtitle}</span>}
      </div>
      {onMore ? (
        <button type="button" className="icon-btn subtle" onClick={onMore} aria-label="Plus d’actions">
          <Icon name="more" />
        </button>
      ) : (
        <span className="icon-btn-spacer" />
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// 1. Aperçu

function Overview({ game, title, onBack }: { game: ParsedGame; title: string; onBack: () => void }) {
  const { analysis, ply, flipped } = useReview();
  const { goTo, setStage, setTrainingMode } = useReview.getState();
  const [menu, setMenu] = useState(false);
  const [train, setTrain] = useState(false);
  if (!analysis) return null;
  const open = (p: number) => {
    goTo(p);
    setStage('moves');
  };
  const keyMoment = () => {
    const i = analysis.moves.findIndex((m) => m.label === 'mistake' || m.label === 'blunder' || m.label === 'miss');
    open(i >= 0 ? i + 1 : 1);
  };
  const hasMistake = analysis.moves.some((m) => m.label === 'mistake' || m.label === 'blunder' || m.label === 'miss');
  return (
    <>
      <TopBar title={title} onBack={onBack} onMore={() => setMenu(true)} subtitle="Aperçu" />
      <div className="overview">
        <div className="overview-main">
          <Summary game={game} analysis={analysis} onSelect={open}>
            <div className="overview-graph">
              <EvalGraph analysis={analysis} plies={game.moves.length} ply={ply} onSelect={open} />
            </div>
          </Summary>
        </div>
        <div className="overview-actions">
          <button type="button" className="primary big" onClick={keyMoment}>
            {hasMistake ? 'Revoir les moments clés' : 'Revoir la partie'}
          </button>
          <button type="button" className="ghost" onClick={() => open(0)}>
            Coup par coup depuis le début
          </button>
          <button type="button" className="ghost" onClick={() => setTrain(true)}>
            Entraîner sur cette partie
          </button>
        </div>
      </div>
      {train && (
        <MenuSheet
          title="Entraîner sur cette partie"
          onClose={() => setTrain(false)}
          groups={[
            [
              { label: `Devine le coup (${flipped ? 'noirs' : 'blancs'})`, icon: 'training', onSelect: () => setTrainingMode('guess') },
              { label: 'Rejouer contre le moteur', icon: 'board', onSelect: () => setTrainingMode('play') },
            ],
          ]}
        />
      )}
      {menu && <ReviewMenu game={game} onClose={() => setMenu(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Coup par coup

interface ExploreMove {
  san: string;
  uci: string;
  fen: string;
}

function MovesView({ game, title, onBack }: { game: ParsedGame; title: string; onBack: () => void }) {
  const { analysis, error, ply, flipped, autoplay, errorFilter, stored } = useReview();
  const { goTo, step, flip, setAutoplay } = useReview.getState();
  const { coordinates, animations, notation, narration, board3d } = useSettings();
  const speed = useSettings((s) => s.playSpeed);
  const [presenting, setPresenting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [deep, setDeep] = useState<DeepTab | null>(null);
  const speech = useRef<Promise<void>>(Promise.resolve());
  const anim = useRef({ ply, forward: false });
  if (anim.current.ply !== ply) anim.current = { ply, forward: ply === anim.current.ply + 1 };

  // Lecture automatique (avec la narration, le coup suivant attend la fin de la phrase).
  useEffect(() => {
    if (!autoplay) return;
    if (ply >= game.moves.length) {
      setAutoplay(false);
      return;
    }
    let cancelled = false;
    let t = 0;
    void (narration ? speech.current : Promise.resolve()).then(() => {
      if (!cancelled) t = window.setTimeout(() => step(1), narration ? 500 : speed * 1000);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [autoplay, ply, game, speed, step, setAutoplay, narration]);

  useEffect(() => {
    if (!narration || ply === 0) return;
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

  // Présentation : vrai plein écran si le navigateur le permet (webkit sur iPad), sinon plein écran dans la page.
  // L'état suit fullscreenchange : quitter par le geste du système quitte aussi la présentation.
  useEffect(() => {
    if (!presenting) return;
    document.body.classList.add('presenting');
    const doc = document as Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    const fsElement = () => document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    let wentFullscreen = false;
    const onChange = () => {
      if (fsElement()) wentFullscreen = true;
      else if (wentFullscreen || document.fullscreenEnabled) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    try {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
      else el.webkitRequestFullscreen?.();
    } catch {
      /* pas de plein écran (iPhone, app installée) : le mode reste dans la page */
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.sheet-layer')) setPresenting(false);
    };
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.body.classList.remove('presenting');
      try {
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
      } catch {
        /* déjà sorti */
      }
    };
  }, [presenting]);

  const jumpError = useCallback(
    (dir: 1 | -1) => {
      if (!analysis) return;
      const ok = (i: number) => REVIEW_LABELS.includes(analysis.moves[i]?.label) && (errorFilter === 'all' || game.moves[i].color === errorFilter);
      for (let p = ply + dir; p >= 1 && p <= analysis.moves.length; p += dir) if (ok(p - 1)) return goTo(p);
    },
    [analysis, errorFilter, game, ply, goTo],
  );

  // Mode Explorer : variante jouée depuis la position affichée, sans toucher à la partie.
  const [explore, setExplore] = useState<ExploreMove[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [multiPv, setMultiPv] = useState(3);
  const [shownBest, setShownBest] = useState(0);
  useEffect(() => {
    setExplore([]);
    setSelected(undefined);
  }, [ply, stored?.id]);
  const gameFen = ply > 0 ? game.moves[ply - 1].fenAfter : game.startFen;
  const fen = explore.length ? explore[explore.length - 1].fen : gameFen;
  const wantLines = deep === 'engine' || shownBest > 0;
  const live = useLiveEngine(explore.length || wantLines ? fen : null, 18, explore.length && !wantLines ? 1 : Math.max(multiPv, shownBest));

  const onSquareTap = (sq: string) => {
    const chess = new Chess(fen);
    if (selected) {
      const m = chess.moves({ square: selected as Square, verbose: true }).find((x) => x.to === sq);
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

  // Clavier : ← → (coup), ↑ ↓ (début/fin), F (retourner), espace (lecture), E (erreur suivante), 1 à 3 (meilleurs coups)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || document.querySelector('.sheet-layer')) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (['1', '2', '3'].includes(e.key)) setShownBest((n) => (n === Number(e.key) ? 0 : Number(e.key)));
      else if (e.key === 'ArrowUp') goTo(0);
      else if (e.key === 'ArrowDown') goTo(Number.MAX_SAFE_INTEGER);
      else if (e.key === 'f' || e.key === 'F') flip();
      else if (e.key === 'e' || e.key === 'E') jumpError(1);
      else if (e.key === ' ') setAutoplay(!useReview.getState().autoplay);
      else if (e.key === 'Escape') setShownBest(0);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, goTo, flip, setAutoplay, jumpError]);

  const move = ply > 0 ? game.moves[ply - 1] : undefined;
  const moveAnalysis = ply > 0 ? analysis?.moves[ply - 1] : undefined;
  const exploring = explore.length > 0;
  const lastExplore = exploring ? explore[explore.length - 1] : undefined;
  const arrows: Arrow[] = [];
  if (shownBest && live.result) {
    for (const l of live.result.lines.slice(0, shownBest)) if (l.pv[0]) arrows.push({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), kind: 'best' });
  } else if (!exploring && moveAnalysis && !moveAnalysis.playedIsBest && moveAnalysis.bestUci && moveAnalysis.label !== 'book') {
    arrows.push({ from: moveAnalysis.bestUci.slice(0, 2), to: moveAnalysis.bestUci.slice(2, 4), kind: 'best' });
  }
  const playedMove = move ? { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) } : undefined;
  const lastMove = lastExplore ? { from: lastExplore.uci.slice(0, 2), to: lastExplore.uci.slice(2, 4) } : playedMove;
  const targets = selected ? new Chess(fen).moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];
  const liveScore = live.result?.lines[0]?.score;
  const winWhite = exploring ? (liveScore ? winWhite_(liveScore) : null) : (analysis?.winsWhite[ply] ?? null);
  const score = exploring ? liveScore : analysis?.scores[ply];
  const h = game.headers;
  const top = flipped ? { name: h.White, elo: h.WhiteElo, clock: lastClock(game.moves, ply, 'w') } : { name: h.Black, elo: h.BlackElo, clock: lastClock(game.moves, ply, 'b') };
  const bottom = flipped ? { name: h.Black, elo: h.BlackElo, clock: lastClock(game.moves, ply, 'b') } : { name: h.White, elo: h.WhiteElo, clock: lastClock(game.moves, ply, 'w') };
  const moveLabel = move ? `Coup ${move.moveNumber}${move.color === 'b' ? ' (noirs)' : ''}` : 'Départ';

  return (
    <div className={`moves-view ${presenting ? 'presenting' : ''}`}>
      <div className="board-zone">
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
              animateFrom={animations && (anim.current.forward || exploring) && lastMove ? lastMove.from : undefined}
              coordinates={coordinates}
              onSwipe={(d) => (exploring ? (d < 0 ? setExplore(explore.slice(0, -1)) : undefined) : step(d))}
              onSquareTap={onSquareTap}
              selected={selected}
              targets={targets}
            />
          )}
        </div>
        <PlayerStrip {...bottom} />
        <div className="slim-graph">
          <EvalGraph analysis={analysis} plies={game.moves.length} ply={ply} onSelect={goTo} />
        </div>
      </div>

      <aside className="move-panel">
        <TopBar title={title} onBack={onBack} onMore={() => setMenu(true)} subtitle={moveLabel} />
        <AnalysisBanner />
        {error && <p className="notice warn">{error}</p>}
        <div className="move-card">
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
        </div>
        <button type="button" className="deep-btn" onClick={() => setDeep('engine')}>
          <Icon name="layers" />
          <span>Approfondir</span>
          <span className="muted small">moteur, coups, temps, chiffres</span>
        </button>
        <nav className="move-nav" aria-label="Navigation dans la partie">
          <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Coup précédent" disabled={ply === 0}>
            <Icon name="prev" />
          </button>
          <button type="button" className="icon-btn play" onClick={() => setAutoplay(!autoplay)} aria-label={autoplay ? 'Pause' : 'Lecture automatique'} aria-pressed={autoplay}>
            <Icon name={autoplay ? 'pause' : 'play'} />
          </button>
          <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Coup suivant" disabled={ply >= game.moves.length}>
            <Icon name="next" />
          </button>
          <button type="button" className="error-next" onClick={() => jumpError(1)} disabled={!analysis} aria-label="Erreur suivante">
            <Icon name="next-error" />
            <span>Erreur suivante</span>
          </button>
        </nav>
      </aside>

      {deep && (
        <DeepSheet
          tab={deep}
          onTab={setDeep}
          onClose={() => setDeep(null)}
          game={game}
          fen={fen}
          live={live}
          multiPv={multiPv}
          setMultiPv={setMultiPv}
          shownBest={shownBest}
          setShownBest={setShownBest}
          exploring={exploring}
        />
      )}
      {menu && (
        <ReviewMenu
          game={game}
          onClose={() => setMenu(false)}
          extra={[
            { label: 'Mode présentation', icon: 'expand', onSelect: () => setPresenting(true) },
            { label: 'Aller au début', icon: 'first', onSelect: () => goTo(0) },
            { label: 'Aller à la fin', icon: 'last', onSelect: () => goTo(game.moves.length) },
            { label: 'Erreur précédente', icon: 'prev', onSelect: () => jumpError(-1), disabled: !analysis },
          ]}
        />
      )}
      {presenting && (
        <button type="button" className="present-exit icon-btn" onClick={() => setPresenting(false)} aria-label="Quitter la présentation">
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

/** Bandeau discret pendant l'analyse : progression et niveau, changeable avant ou pendant. */
function AnalysisBanner() {
  const { analysis, progress, stored } = useReview();
  const { analyze, cancel } = useReview.getState();
  const level = useSettings((s) => s.level);
  if (stored?.unanalyzable) return null;
  if (progress) {
    const current = analysis?.level ?? level;
    return (
      <div className="analysis-banner" role="status">
        <div className="banner-row">
          <span>
            Analyse {progress.done} / {progress.total}
          </span>
          <label className="banner-level">
            <span className="sr-only">Niveau de revue</span>
            <select value={current} onChange={(e) => void analyze(e.target.value as ReviewLevel)}>
              {(Object.keys(REVIEW_LEVELS) as ReviewLevel[]).map((l) => (
                <option key={l} value={l}>
                  {REVIEW_LEVELS[l].label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="link-btn" onClick={cancel}>
            Pause
          </button>
        </div>
        <div className="progress-bar">
          <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      </div>
    );
  }
  if (!analysis?.complete)
    return (
      <div className="analysis-banner" role="status">
        <div className="banner-row">
          <span>{analysis ? 'Analyse en pause.' : 'Partie non analysée.'}</span>
          <button type="button" className="link-btn" onClick={() => void analyze(analysis?.level ?? level)}>
            {analysis ? 'Reprendre' : 'Analyser'}
          </button>
        </div>
      </div>
    );
  return null;
}

// ---------------------------------------------------------------------------
// 3. Approfondir

function DeepSheet(props: {
  tab: DeepTab;
  onTab: (t: DeepTab) => void;
  onClose: () => void;
  game: ParsedGame;
  fen: string;
  live: ReturnType<typeof useLiveEngine>;
  multiPv: number;
  setMultiPv: (n: number) => void;
  shownBest: number;
  setShownBest: (n: number) => void;
  exploring: boolean;
}) {
  const { tab, onTab, onClose, game, fen, live, multiPv, setMultiPv, shownBest, setShownBest, exploring } = props;
  const { analysis, ply, deepening } = useReview();
  const { goTo, step, deepen } = useReview.getState();
  const notation = useSettings((s) => s.notation);
  const hasClock = game.moves.some((m) => m.clock !== undefined);
  const tabs: [DeepTab, string][] = [
    ['engine', 'Moteur'],
    ['moves', 'Coups'],
    ...(hasClock ? ([['time', 'Temps']] as [DeepTab, string][]) : []),
    ['numbers', 'Chiffres'],
  ];
  const ev = analysis?.evals?.[ply - 1];
  const a = ply > 0 ? analysis?.moves[ply - 1] : undefined;
  return (
    <Sheet title="Approfondir" onClose={onClose} className="deep-sheet">
      <div className="segmented" role="tablist" aria-label="Approfondir">
        {tabs.map(([id, label]) => (
          <button type="button" role="tab" key={id} aria-selected={tab === id} onClick={() => onTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'engine' && (
        <div className="deep-body">
          <p className="muted small">{exploring ? 'Lignes de la position explorée.' : 'Touche une pièce sur l’échiquier pour explorer une autre suite.'}</p>
          <div className="row-between">
            <label className="small">
              Lignes{' '}
              <select value={multiPv} onChange={(e) => setMultiPv(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="chips-row" role="group" aria-label="Flèches des meilleurs coups">
              {[1, 2, 3].map((n) => (
                <button type="button" key={n} className={`chip ${shownBest === n ? 'active' : ''}`} aria-pressed={shownBest === n} onClick={() => setShownBest(shownBest === n ? 0 : n)}>
                  {n} flèche{n > 1 ? 's' : ''}
                </button>
              ))}
            </div>
          </div>
          {live.loading && <p className="muted small">Calcul en profondeur 18…</p>}
          {live.result?.lines.map((l) => (
            <p key={l.multipv} className="engine-line">
              <span className="line-score">{formatScore(l.score)}</span>
              <span>{pvToSan(fen, l.pv, 10).map((x) => displaySan(x, notation)).join(' ')}</span>
            </p>
          ))}
          {ev && <EngineFacts ev={ev} />}
          {ply > 0 && analysis?.complete && (
            <button type="button" className="ghost" disabled={deepening !== null} onClick={() => void deepen(ply)}>
              {deepening === ply ? `Calcul en profondeur ${DEEP_DEPTH}…` : `Analyser ce coup plus profondément (profondeur ${DEEP_DEPTH})`}
            </button>
          )}
        </div>
      )}
      {tab === 'moves' && (
        <div className="deep-body">
          <MoveList moves={game.moves} analysis={analysis} ply={ply} onSelect={goTo} onSwipe={(d) => step(d)} />
        </div>
      )}
      {tab === 'time' && hasClock && (
        <div className="deep-body">
          <TimeGraph moves={game.moves} timeControl={game.headers.TimeControl} ply={ply} onSelect={goTo} />
        </div>
      )}
      {tab === 'numbers' && (
        <div className="deep-body">
          {a ? (
            <dl className="facts">
              <dt>Chances de gain avant</dt>
              <dd>{a.winBefore.toFixed(1).replace('.', ',')} %</dd>
              <dt>Chances de gain après</dt>
              <dd>{a.winAfter.toFixed(1).replace('.', ',')} %</dd>
              <dt>Perte (ΔW)</dt>
              <dd>{Math.max(0, a.winBefore - a.winAfter).toFixed(1).replace('.', ',')} points</dd>
              <dt>Évaluation avant → après</dt>
              <dd>
                {formatScore(a.scoreBefore)} → {formatScore(a.scoreAfter)}
              </dd>
              <dt>Précision du coup</dt>
              <dd>{Math.round(a.accuracy)} %</dd>
            </dl>
          ) : (
            <p className="muted">Avance d’un coup pour voir ses chiffres.</p>
          )}
          {ev && <EngineFacts ev={ev} />}
        </div>
      )}
    </Sheet>
  );
}

/** Transparence du moteur : profondeur atteinte, temps passé, nombre de lignes. */
export function EngineFacts({ ev }: { ev: { depth: number; lines: unknown[]; timeMs?: number } }) {
  return (
    <p className="engine-facts small muted" data-testid="engine-facts">
      Calcul du coup : profondeur {ev.depth} · {ev.timeMs !== undefined ? `${(ev.timeMs / 1000).toFixed(1).replace('.', ',')} s` : 'temps inconnu (cache)'} · {ev.lines.length} ligne{ev.lines.length > 1 ? 's' : ''}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Menu « … »

function ReviewMenu({ game, onClose, extra = [] }: { game: ParsedGame; onClose: () => void; extra?: MenuItem[] }) {
  const { analysis, ply, errorFilter, stage } = useReview();
  const { flip, setErrorFilter, setStage, analyze } = useReview.getState();
  const s = useSettings();
  const setNotice = useToast.getState().show;
  const h = game.headers;
  const speedName = SPEEDS.find(([v]) => v === s.playSpeed)?.[1] ?? 'Normale';
  const filterName = { all: 'Les deux', w: 'Blancs', b: 'Noirs' }[errorFilter];
  const nextFilter = { all: 'w', w: 'b', b: 'all' } as const;
  const levels = Object.keys(REVIEW_LEVELS) as ReviewLevel[];
  const groups: MenuItem[][] = [
    [
      ...(stage !== 'overview' && analysis?.complete ? [{ label: 'Aperçu de la partie', icon: 'chart', onSelect: () => setStage('overview') }] : []),
      ...(stage === 'overview' ? [{ label: 'Coup par coup', icon: 'board', onSelect: () => setStage('moves') }] : []),
      ...extra,
    ],
    [
      { label: 'Retourner l’échiquier', icon: 'flip', onSelect: flip },
      { label: 'Échiquier en 3D', icon: 'board', checked: s.board3d, onSelect: () => s.set({ board3d: !s.board3d }) },
      ...(speechAvailable()
        ? [
            {
              label: 'Narration à voix haute',
              icon: 'speaker',
              checked: s.narration,
              onSelect: () => {
                if (s.narration) stopSpeaking();
                s.set({ narration: !s.narration });
              },
            },
          ]
        : []),
      { label: 'Vitesse de lecture', icon: 'play', value: speedName, onSelect: () => s.set({ playSpeed: SPEEDS[(SPEEDS.findIndex(([v]) => v === s.playSpeed) + 1) % SPEEDS.length][0] }) },
      { label: 'Erreurs à parcourir', icon: 'next-error', value: filterName, onSelect: () => setErrorFilter(nextFilter[errorFilter]) },
      {
        label: 'Niveau de revue',
        icon: 'layers',
        value: analysis ? REVIEW_LEVELS[analysis.level].label : REVIEW_LEVELS[s.level].label,
        onSelect: () => {
          const cur = analysis?.level ?? s.level;
          void analyze(levels[(levels.indexOf(cur) + 1) % levels.length]);
        },
      },
    ],
    [
      {
        label: 'Exporter le PGN annoté',
        icon: 'download',
        disabled: !analysis?.complete,
        onSelect: async () => {
          if (!analysis) return;
          const pgn = exportAnnotatedPgn(game, analysis, analysis.evals ?? []);
          const r = await shareOrDownload(new Blob([pgn], { type: 'application/x-chess-pgn' }), `${safeFilename(`${h.White ?? 'blancs'}-${h.Black ?? 'noirs'}`)}.pgn`, 'Partie annotée');
          setNotice(r === 'downloaded' ? 'PGN annoté téléchargé.' : r === 'shared' ? 'PGN annoté partagé.' : null);
        },
      },
      {
        label: 'Image de la position',
        icon: 'upload',
        onSelect: async () => {
          const svg = document.querySelector<SVGSVGElement>('.board-zone svg.board');
          if (!svg) return;
          try {
            const r = await shareOrDownload(await boardToPng(svg), `${safeFilename(`position-${ply}`)}.png`, 'Position');
            setNotice(r === 'downloaded' ? 'Image téléchargée.' : r === 'shared' ? 'Image partagée.' : null);
          } catch (e) {
            setNotice((e as Error).message);
          }
        },
      },
    ],
  ];
  return <MenuSheet title="Actions" groups={groups} onClose={onClose} />;
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
      <span className="avatar-sm" aria-hidden="true">
        {(name ?? '?').slice(0, 1).toUpperCase()}
      </span>
      <span className="strip-name">{name ?? '?'}</span>
      {elo && <span className="muted">{elo}</span>}
      {clock !== undefined && <span className="strip-clock">{formatStripClock(clock)}</span>}
    </div>
  );
}

function formatStripClock(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
