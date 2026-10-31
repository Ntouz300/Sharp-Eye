import { Chess, type Square } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import type { GameAnalysis } from '../../analysis/analyzeGame';
import { winPercentFor } from '../../analysis/winPercent';
import { Board, type Arrow } from '../../board/Board';
import { getEngine, getOpponentEngine } from '../../engine/stockfish';
import type { ParsedGame } from '../../pgn/types';
import { LabelIcon } from '../../ui/LabelIcon';
import { displaySan } from '../../ui/notation';
import { useSettings } from '../settings/settings';

/** Sélection d'une pièce puis d'une case ; renvoie le coup joué. */
function useTapMove(fen: string, enabled: boolean, onMove: (uci: string, san: string, fenAfter: string) => void) {
  const [selected, setSelected] = useState<string | undefined>();
  useEffect(() => setSelected(undefined), [fen]);
  const chess = new Chess(fen);
  const onTap = (sq: string) => {
    if (!enabled) return;
    if (selected) {
      const m = chess.moves({ square: selected as Square, verbose: true }).find((x) => x.to === sq);
      if (m) {
        const mv = chess.move({ from: m.from, to: m.to, promotion: m.promotion ? 'q' : undefined });
        setSelected(undefined);
        onMove(mv.from + mv.to + (mv.promotion ?? ''), mv.san, chess.fen());
        return;
      }
    }
    const piece = chess.get(sq as Square);
    setSelected(piece && piece.color === chess.turn() && sq !== selected ? sq : undefined);
  };
  const targets = selected ? chess.moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];
  return { onTap, selected, targets };
}

// ---------------------------------------------------------------------------
// Devine le coup

interface GuessResult {
  ply: number;
  guess: string;
  points: number;
  text: string;
}

/** Avant chaque coup du joueur choisi, l'app cache la suite et note le coup proposé (3 points au maximum). */
export function GuessMode({ game, analysis, startPly, side, onExit }: { game: ParsedGame; analysis: GameAnalysis | null; startPly: number; side: 'w' | 'b'; onExit: (ply: number) => void }) {
  const { coordinates, notation } = useSettings();
  const firstPly = (() => {
    for (let p = startPly; p < game.moves.length; p++) if (game.moves[p].color === side) return p;
    return game.moves.length;
  })();
  const [ply, setPly] = useState(firstPly);
  const [results, setResults] = useState<GuessResult[]>([]);
  const [pending, setPending] = useState<GuessResult | null>(null);
  const [busy, setBusy] = useState(false);
  const done = ply >= game.moves.length;
  const fen = ply > 0 ? game.moves[ply - 1].fenAfter : game.startFen;
  const target = game.moves[ply];

  const tap = useTapMove(fen, !done && !pending && !busy, async (uci, san) => {
    const a = analysis?.moves[ply];
    let points = 0;
    let text: string;
    if (a?.bestUci === uci) {
      points = 3;
      text = 'Meilleur coup du moteur !';
    } else if (uci === target.uci) {
      points = a && ['best', 'excellent', 'good', 'great', 'brilliant', 'book'].includes(a.label) ? 2 : 1;
      text = 'C’est le coup joué dans la partie.';
    } else {
      setBusy(true);
      const r = await getEngine().analyze(new Chess(fen).fen(), 12, 1).catch(() => null);
      const after = new Chess(fen);
      after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      const ev = await getEngine().analyze(after.fen(), 12, 1).catch(() => null);
      setBusy(false);
      const wb = r ? winPercentFor(r.lines[0].score, side) : 50;
      const wa = ev ? winPercentFor(ev.lines[0].score, side) : 0;
      const loss = Math.max(0, wb - wa);
      points = loss <= 2 ? 2 : loss <= 5 ? 1 : 0;
      text = loss <= 2 ? 'Aussi bon que le meilleur coup.' : loss <= 5 ? 'Un bon coup.' : loss <= 10 ? 'Une imprécision.' : 'Ce coup perdait trop.';
    }
    setPending({ ply, guess: san, points, text });
  });

  const next = () => {
    if (pending) setResults([...results, pending]);
    setPending(null);
    let p = ply + 1;
    while (p < game.moves.length && game.moves[p].color !== side) p++;
    setPly(p);
  };

  const total = results.reduce((a, r) => a + r.points, 0);
  const a = analysis?.moves[ply];
  const arrows: Arrow[] = pending && target ? [{ from: target.uci.slice(0, 2), to: target.uci.slice(2, 4), kind: 'played' }] : [];
  if (pending && a?.bestUci && a.bestUci !== target.uci) arrows.push({ from: a.bestUci.slice(0, 2), to: a.bestUci.slice(2, 4), kind: 'best' });

  return (
    <div className="training">
      <div className="training-board">
        <Board fen={fen} flipped={side === 'b'} coordinates={coordinates} onSquareTap={tap.onTap} selected={tap.selected} targets={tap.targets} arrows={arrows} lastMove={ply > 0 ? { from: game.moves[ply - 1].uci.slice(0, 2), to: game.moves[ply - 1].uci.slice(2, 4) } : undefined} />
      </div>
      <div className="training-side settings-card">
        <h2>Devine le coup</h2>
        <p className="muted small">
          Score : <strong>{total}</strong> / {results.length * 3} · 3 points pour le meilleur coup du moteur, 2 pour un coup aussi bon ou celui de la partie s'il était bon.
        </p>
        {done ? (
          <p>Partie terminée : {total} points sur {results.length * 3} ({results.length ? Math.round((total / (results.length * 3)) * 100) : 0} %).</p>
        ) : pending ? (
          <div className={`report ${pending.points >= 2 ? 'ok' : 'warn'}`} role="status">
            <p>
              Ta proposition : <strong>{displaySan(pending.guess, notation)}</strong> ({pending.points} point{pending.points > 1 ? 's' : ''}). {pending.text}
            </p>
            <p className="small">
              Dans la partie : {displaySan(target.san, notation)} {a && <LabelIcon label={a.label} size={14} />}
              {a?.bestSan && a.bestUci !== target.uci && <> · meilleur coup : {displaySan(a.bestSan, notation)}</>}
            </p>
          </div>
        ) : (
          <p className="puzzle-prompt">
            <span className={`turn-dot ${side}`} aria-hidden="true" /> {busy ? 'Évaluation…' : `Coup ${target.moveNumber} : que joues-tu ?`}
          </p>
        )}
        <div className="import-actions">
          {pending && !done && (
            <button type="button" className="primary" onClick={next}>
              Coup suivant
            </button>
          )}
          <button type="button" className="ghost" onClick={() => onExit(Math.min(ply, game.moves.length))}>
            Quitter
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rejouer contre le moteur

/** Depuis la position affichée, l'utilisateur rejoue la suite contre Stockfish au niveau choisi. */
export function PlayMode({ startFen, onExit }: { startFen: string; onExit: () => void }) {
  const { coordinates, notation } = useSettings();
  const side = new Chess(startFen).turn();
  const [elo, setElo] = useState(1500);
  const [history, setHistory] = useState<{ fen: string; san: string; uci: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const fen = history.length ? history[history.length - 1].fen : startFen;
  const chess = new Chess(fen);
  const over = chess.isGameOver();
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const engineMove = async (from: string, hist: typeof history) => {
    setThinking(true);
    const uci = await getOpponentEngine().bestMove(from, elo).catch(() => null);
    if (!alive.current) return;
    setThinking(false);
    if (!uci) return;
    const c = new Chess(from);
    const mv = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    setHistory([...hist, { fen: c.fen(), san: mv.san, uci }]);
  };

  const tap = useTapMove(fen, !over && !thinking && chess.turn() === side, (uci, san, fenAfter) => {
    const hist = [...history, { fen: fenAfter, san, uci }];
    setHistory(hist);
    if (!new Chess(fenAfter).isGameOver()) void engineMove(fenAfter, hist);
  });

  const last = history[history.length - 1];
  let status = thinking ? 'Le moteur réfléchit…' : chess.turn() === side ? 'À toi de jouer.' : '';
  if (over) status = chess.isCheckmate() ? (chess.turn() === side ? 'Échec et mat : le moteur gagne.' : 'Échec et mat : tu gagnes !') : 'Partie nulle.';

  return (
    <div className="training">
      <div className="training-board">
        <Board fen={fen} flipped={side === 'b'} coordinates={coordinates} onSquareTap={tap.onTap} selected={tap.selected} targets={tap.targets} lastMove={last ? { from: last.uci.slice(0, 2), to: last.uci.slice(2, 4) } : undefined} animateFrom={last?.uci.slice(0, 2)} />
      </div>
      <div className="training-side settings-card">
        <h2>Rejouer contre le moteur</h2>
        <label className="elo-slider">
          <span>
            Niveau du moteur : <strong>{elo} Elo</strong>
          </span>
          <input type="range" min={800} max={2800} step={100} value={elo} onChange={(e) => setElo(Number(e.target.value))} disabled={history.length > 0} />
        </label>
        <p className="puzzle-prompt">
          <span className={`turn-dot ${side}`} aria-hidden="true" /> {status}
        </p>
        <p className="small">{history.map((h) => displaySan(h.san, notation)).join(' ') || 'Tu joues les ' + (side === 'w' ? 'blancs.' : 'noirs.')}</p>
        <div className="import-actions">
          <button type="button" className="ghost" disabled={thinking || history.length < 2} onClick={() => setHistory(history.slice(0, history[history.length - 1] && new Chess(history[history.length - 1].fen).turn() === side ? -2 : -1))}>
            Reprendre mon coup
          </button>
          <button type="button" className="ghost" onClick={() => setHistory([])} disabled={thinking}>
            Recommencer
          </button>
          <button type="button" className="primary" onClick={onExit}>
            Revenir à la revue
          </button>
        </div>
      </div>
    </div>
  );
}
