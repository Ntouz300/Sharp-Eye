import { Chess, type Square } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import { whyItFails } from '../../analysis/explain';
import { Board, type Arrow } from '../../board/Board';
import { getEngine } from '../../engine/stockfish';
import { db } from '../../storage/db';
import { displaySan } from '../../ui/notation';
import { speak, stopSpeaking } from '../../ui/speech';
import { useReview } from '../review/store';
import { useSettings } from '../settings/settings';
import { recordChallenge } from './bank';
import { ensureLine, fenAfter, hint, instruction, judge, keyIdea, playerMoves, points, stepPhrase, type Challenge, type Evaluate } from './challenge';

const evaluate: Evaluate = (fen, depth, multiPv) => getEngine().analyze(fen, depth, multiPv);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 15 mots au plus : les phrases affichées et lues restent courtes. */
export function short(text: string, max = 15): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : `${words.slice(0, max).join(' ').replace(/[,;:]$/, '')}…`;
}

export function sanLine(fen: string, line: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of line) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

type Phase = 'loading' | 'play' | 'thinking' | 'refuted' | 'done';
interface Note {
  kind: 'good' | 'alt' | 'wrong' | 'info';
  text: string;
}

export interface ChallengeResult {
  success: boolean;
  points: number;
}

/**
 * Un défi en plusieurs coups : tu joues, le moteur défend. Chaque bon coup est expliqué ; une erreur est
 * réfutée sur l'échiquier, expliquée en une phrase, puis tu réessaies. À la fin : « Pourquoi c'est le meilleur ».
 */
export function ChallengePlayer({ challenge, daily, onNext, nextLabel }: { challenge: Challenge; daily?: boolean; onNext?: () => void; nextLabel?: string }) {
  const { coordinates, notation, narration, set: setSettings } = useSettings();
  const [ch, setCh] = useState<Challenge>(challenge);
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState(0);
  const [fen, setFen] = useState(challenge.fen);
  const [last, setLast] = useState<{ from: string; to: string } | undefined>();
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [wrongs, setWrongs] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const alive = useRef(true);
  const color = new Chess(challenge.fen).turn();

  const say = (text: string) => {
    if (useSettings.getState().narration) void speak(text);
  };

  // Préparation : un ancien puzzle trop court est rallongé avec le moteur.
  useEffect(() => {
    alive.current = true;
    void (async () => {
      const ready = playerMoves(challenge.line) >= 2 ? challenge : await ensureLine(challenge, evaluate);
      if (!alive.current) return;
      setCh(ready);
      setPhase('play');
      say(instruction(ready));
    })();
    return () => {
      alive.current = false;
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id]);

  const total = playerMoves(ch.line);
  const done = Math.floor(step / 2);
  const before = fenAfter(ch.fen, ch.line.slice(0, step)) ?? ch.fen;

  const finish = async (line: string[], success: boolean) => {
    setPhase('done');
    const pts = success ? points(hintsUsed, wrongs) : 0;
    setResult({ success, points: pts });
    setCh((c) => ({ ...c, line }));
    await recordChallenge({ ...ch, line }, success, { daily });
  };

  const afterGoodMove = async (line: string[], s: number, note: Note) => {
    setNotes((n) => [...n, note]);
    say(note.text);
    setHintLevel(0);
    setArrows([]);
    if (s + 1 >= line.length) {
      await finish(line, wrongs === 0 && !revealed);
      return;
    }
    setPhase('thinking');
    await wait(550);
    if (!alive.current) return;
    const reply = line[s + 1];
    setFen(fenAfter(ch.fen, line.slice(0, s + 2))!);
    setLast({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
    setStep(s + 2);
    setPhase('play');
  };

  const onMove = async (uci: string) => {
    const s = step;
    const pos = before;
    setSelected(undefined);
    setFen(fenAfter(pos, [uci]) ?? pos);
    setLast({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
    setPhase('thinking');
    const v = await judge(ch, s, uci, evaluate);
    if (!alive.current) return;
    if (v.kind === 'exact') {
      await afterGoodMove(ch.line, s, { kind: 'good', text: short(stepPhrase(pos, ch.line.slice(s))) });
    } else if (v.kind === 'alternative') {
      const line = v.line;
      setCh((c) => ({ ...c, line }));
      const san = displaySan(sanLine(pos, [uci])[0] ?? '', notation);
      await afterGoodMove(line, s, { kind: 'alt', text: `${san} gagne aussi : coup accepté.` });
    } else {
      setWrongs((w) => w + 1);
      const reason = short(v.reason);
      setNotes((n) => [...n, { kind: 'wrong', text: reason }]);
      if (v.reply[0]) {
        await wait(500);
        if (!alive.current) return;
        const r = v.reply[0];
        setFen(fenAfter(pos, [uci, r]) ?? pos);
        setLast({ from: r.slice(0, 2), to: r.slice(2, 4) });
        setArrows([{ from: r.slice(0, 2), to: r.slice(2, 4), kind: 'played' }]);
      }
      say(reason);
      setPhase('refuted');
    }
  };

  const retry = () => {
    setFen(before);
    setLast(step > 0 ? { from: ch.line[step - 1].slice(0, 2), to: ch.line[step - 1].slice(2, 4) } : undefined);
    setArrows([]);
    setPhase('play');
  };

  // « Voir la solution » : la combinaison est jouée coup par coup, le défi compte comme raté.
  const reveal = async () => {
    setRevealed(true);
    setPhase('thinking');
    setArrows([]);
    for (let s = step; s < ch.line.length; s++) {
      await wait(s === step ? 200 : 700);
      if (!alive.current) return;
      const u = ch.line[s];
      setFen(fenAfter(ch.fen, ch.line.slice(0, s + 1))!);
      setLast({ from: u.slice(0, 2), to: u.slice(2, 4) });
      if (s % 2 === 0) {
        const text = short(stepPhrase(fenAfter(ch.fen, ch.line.slice(0, s))!, ch.line.slice(s)));
        setNotes((n) => [...n, { kind: 'info', text }]);
      }
    }
    await finish(ch.line, false);
  };

  const askHint = () => {
    const lvl = Math.min(3, hintLevel + 1) as 1 | 2 | 3;
    setHintLevel(lvl);
    setHintsUsed((h) => h + 1);
    const h = hint(ch, step, lvl);
    say(h.text);
  };
  const currentHint = hintLevel ? hint(ch, step, hintLevel as 1 | 2 | 3) : null;

  const board = new Chess(fen);
  const onTap = (sq: string) => {
    if (phase !== 'play') return;
    if (selected) {
      const m = board.moves({ square: selected as Square, verbose: true }).find((x) => x.to === sq);
      if (m) {
        void onMove(m.from + m.to + (m.promotion ? 'q' : ''));
        return;
      }
    }
    const piece = board.get(sq as Square);
    setSelected(piece && piece.color === board.turn() && sq !== selected ? sq : undefined);
  };
  const targets = selected && phase === 'play' ? board.moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];
  const hintArrows: Arrow[] = currentHint?.square && hintLevel === 3 ? [{ from: ch.line[step].slice(0, 2), to: ch.line[step].slice(2, 4), kind: 'best' }] : [];

  const openGame = async () => {
    if (!ch.gameId || ch.source !== 'game') return;
    const g = await db.games.get(ch.gameId);
    if (g) await useReview.getState().openGame(g, { stage: 'moves', ply: ch.moveIndex ?? 0 });
  };

  return (
    <div className="challenge" data-testid="challenge" data-fen={ch.fen} data-line={ch.line.join(" ")} data-step={step} data-phase={phase}>
      <div className="challenge-layout">
        <div className="puzzle-board">
          <Board
            fen={fen}
            flipped={color === 'b'}
            lastMove={last}
            arrows={[...arrows, ...hintArrows]}
            coordinates={coordinates}
            onSquareTap={onTap}
            selected={selected ?? (hintLevel === 2 ? currentHint?.square : undefined)}
            targets={targets}
          />
        </div>
        <div className="challenge-side settings-card">
          <div className="challenge-head">
            {daily && <span className="chip active">Défi du jour</span>}
            <span className="muted small">
              {ch.theme} · ≈ {ch.rating}
            </span>
            <button
              type="button"
              className={`icon-btn narr-btn ${narration ? 'on' : ''}`}
              aria-pressed={narration}
              aria-label={narration ? 'Couper la narration' : 'Lire à voix haute'}
              onClick={() => {
                if (narration) stopSpeaking();
                setSettings({ narration: !narration });
              }}
            >
              {narration ? '🔊' : '🔈'}
            </button>
          </div>
          <p className="puzzle-prompt" data-testid="instruction">
            <span className={`turn-dot ${color}`} aria-hidden="true" /> {instruction(ch)}
          </p>
          <ol className="step-dots" aria-label={`Coup ${Math.min(done + 1, total)} sur ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <li key={i} className={i < done || (phase === 'done' && result?.success) ? 'ok' : i === done && phase !== 'done' ? 'now' : ''} />
            ))}
          </ol>
          <ul className="step-notes" aria-live="polite">
            {notes.map((n, i) => (
              <li key={i} className={`note-${n.kind}`}>
                {n.text}
              </li>
            ))}
            {phase === 'thinking' && !revealed && <li className="muted small">Le moteur réfléchit…</li>}
            {phase === 'loading' && <li className="muted small">Préparation du défi…</li>}
          </ul>
          {currentHint && phase !== 'done' && (
            <p className="hint-text" role="status">
              Indice {hintLevel}/3 : {currentHint.text}
            </p>
          )}
          {phase === 'refuted' && (
            <div className="import-actions">
              <button type="button" className="primary" onClick={retry}>
                Réessayer
              </button>
            </div>
          )}
          {(phase === 'play' || phase === 'refuted') && (
            <div className="import-actions">
              <button type="button" className="ghost" onClick={askHint} disabled={hintLevel >= 3 || phase !== 'play'}>
                {hintLevel === 0 ? 'Indice (−1 point)' : hintLevel < 3 ? 'Indice suivant' : 'Plus d’indice'}
              </button>
              <button type="button" className="ghost" onClick={() => void reveal()}>
                Voir la solution
              </button>
            </div>
          )}
          {phase === 'done' && result && (
            <div className={`report ${result.success ? 'ok' : 'warn'}`} role="status" data-testid="challenge-result">
              <p>
                <strong>{result.success ? `Réussi · ${result.points} point${result.points > 1 ? 's' : ''} sur 3` : revealed ? 'Solution affichée' : 'Réussi après une erreur'}</strong>
              </p>
              <p className="small">{result.success ? 'Ce défi reviendra plus tard pour l’ancrer.' : 'Ce défi reviendra demain.'}</p>
            </div>
          )}
          {phase === 'done' && (
            <div className="import-actions">
              {onNext && (
                <button type="button" className="primary" onClick={onNext}>
                  {nextLabel ?? 'Défi suivant'}
                </button>
              )}
              {ch.source === 'game' && (
                <button type="button" className="ghost" onClick={() => void openGame()}>
                  Voir la partie
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {phase === 'done' && <WhyBest ch={ch} />}
    </div>
  );
}

interface CompareLine {
  key: string;
  title: string;
  fen: string;
  moves: string[];
  phrase: string;
  good: boolean;
}

/** Une tentative (coup de ta partie ou coup naturel) et la réfutation du moteur, avec sa raison. */
async function refuted(fen: string, uci: string): Promise<{ moves: string[]; phrase: string }> {
  const after = fenAfter(fen, [uci]);
  if (!after) return { moves: [uci], phrase: '' };
  const [b, a] = [await evaluate(fen, 12, 1), await evaluate(after, 12, 1)];
  const pv = a.lines[0]?.pv ?? [];
  return { moves: [uci, ...pv.slice(0, 3)], phrase: short(whyItFails(fen, uci, pv, a.lines[0]?.score ?? { cp: 0 }, b.lines[0]?.score ?? { cp: 0 })) };
}

/** Écran de fin : la combinaison comparée au coup de ta partie et à la tentative la plus naturelle. */
export function WhyBest({ ch }: { ch: Challenge }) {
  const [lines, setLines] = useState<CompareLine[] | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const out: CompareLine[] = [{ key: 'best', title: 'La combinaison', fen: ch.fen, moves: ch.line, phrase: short(keyIdea(ch)), good: true }];
      const first = ch.line[0];
      if (ch.played && ch.played !== first) {
        const r = await refuted(ch.fen, ch.played);
        out.push({ key: 'played', title: 'Ton coup dans la partie', fen: ch.fen, ...r, good: false });
      }
      let natural = ch.alt?.[0];
      if (!natural || natural === first || natural === ch.played) {
        // Tentative naturelle : parmi les autres choix du moteur, une prise ou un échec de préférence.
        const ev = await evaluate(ch.fen, 12, 3);
        const others = ev.lines.map((l) => l.pv[0]).filter((u) => u && u !== first && u !== ch.played);
        natural = others.find((u) => /x|\+/.test(sanLine(ch.fen, [u])[0] ?? '')) ?? others[0];
      }
      if (natural && natural !== first && natural !== ch.played) {
        const r = ch.alt?.[0] === natural && ch.alt.length > 1 ? await refuted(ch.fen, natural).then((x) => ({ ...x, moves: ch.alt! })) : await refuted(ch.fen, natural);
        out.push({ key: 'natural', title: 'La tentative naturelle', fen: ch.fen, ...r, good: false });
      }
      if (live) setLines(out);
    })();
    return () => {
      live = false;
    };
  }, [ch]);

  return (
    <section className="why-best" data-testid="why-best">
      <h2>Pourquoi c’est le meilleur</h2>
      {!lines && <p className="muted small">Le moteur compare les autres coups…</p>}
      <div className="why-grid">
        {lines?.map((l) => (
          <LineCard key={l.key} line={l} />
        ))}
      </div>
    </section>
  );
}

/** Une ligne rejouable pas à pas, avec la flèche du coup suivant et une phrase courte. */
function LineCard({ line }: { line: CompareLine }) {
  const { coordinates, notation } = useSettings();
  const [k, setK] = useState(0);
  const sans = sanLine(line.fen, line.moves);
  const fen = fenAfter(line.fen, line.moves.slice(0, k)) ?? line.fen;
  const next = line.moves[k];
  const arrows: Arrow[] = next && k < sans.length ? [{ from: next.slice(0, 2), to: next.slice(2, 4), kind: line.good || k % 2 === 1 ? 'best' : 'played' }] : [];
  const prev = k > 0 ? line.moves[k - 1] : undefined;
  const flipped = new Chess(line.fen).turn() === 'b';
  return (
    <article className={`line-card ${line.good ? 'good' : 'bad'}`} data-testid="line-card">
      <h3>{line.title}</h3>
      <p className="small">{line.phrase}</p>
      <div className="line-board">
        <Board fen={fen} flipped={flipped} arrows={arrows} lastMove={prev ? { from: prev.slice(0, 2), to: prev.slice(2, 4) } : undefined} coordinates={coordinates} />
      </div>
      <p className="line-moves small">
        {sans.map((s, i) => (
          <span key={i} className={i === k - 1 ? 'now' : ''}>
            {displaySan(s, notation)}{' '}
          </span>
        ))}
      </p>
      <div className="line-nav">
        <button type="button" className="icon-btn" aria-label="Coup précédent" onClick={() => setK(Math.max(0, k - 1))} disabled={k === 0}>
          ←
        </button>
        <span className="muted small">
          {k}/{sans.length}
        </span>
        <button type="button" className="icon-btn" aria-label="Coup suivant" onClick={() => setK(Math.min(sans.length, k + 1))} disabled={k >= sans.length}>
          →
        </button>
      </div>
    </article>
  );
}
