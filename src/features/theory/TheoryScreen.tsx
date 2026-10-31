import { Chess, type Square } from 'chess.js';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Board, type Arrow } from '../../board/Board';
import { db } from '../../storage/db';
import { Icon } from '../../ui/Icon';
import { displaySan } from '../../ui/notation';
import { speak, spokenSan, stopSpeaking } from '../../ui/speech';
import { myResult } from '../library/GamesScreen';
import { useReview } from '../review/store';
import { useSettings } from '../settings/settings';
import { gameInOpening, GROUPS, lineMoves, searchOpenings, type TheoryLine, type TheoryOpening } from './openings';
import { fensOf, loadTree, suggestions, type Tree } from './theory';

/** « Caro-Kann : variante d'avance » → « variante d'avance » : la famille est déjà dans le titre. */
const shortName = (name: string) => (name.includes(' : ') ? name.slice(name.indexOf(' : ') + 3) : name);

/** Théorie : les ouvertures connues, leurs variantes et leurs coups clés, à rejouer et à travailler. */
export function TheoryScreen() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<TheoryOpening | null>(null);
  if (open) return <OpeningView opening={open} onBack={() => setOpen(null)} />;
  const found = searchOpenings(query);
  return (
    <div className="screen theory-screen">
      <header className="screen-head">
        <h1>Théorie</h1>
      </header>
      <label className="search">
        <Icon name="search" size={18} />
        <span className="sr-only">Chercher une ouverture</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ouverture, nom anglais ou code ECO" />
      </label>
      {found.length === 0 && <p className="empty-state">Aucune ouverture ne correspond à « {query} ».</p>}
      {GROUPS.map((g) => {
        const list = found.filter((o) => o.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="theory-group">
            <h2>{g}</h2>
            <div className="theme-tiles">
              {list.map((o) => (
                <button type="button" key={o.id} className="theme-tile opening-tile" onClick={() => setOpen(o)}>
                  <strong>{o.name}</strong>
                  <span className="muted small">{o.summary}</span>
                  <span className="muted small">{o.eco}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function OpeningView({ opening, onBack }: { opening: TheoryOpening; onBack: () => void }) {
  const { coordinates, notation, narration, usernames, set: setSettings } = useSettings();
  const [tree, setTree] = useState<Tree | null>(null);
  const [line, setLine] = useState<TheoryLine>(opening.main);
  const [path, setPath] = useState<string[]>(lineMoves(opening.main));
  const [ply, setPly] = useState(0);
  const [drill, setDrill] = useState(false);
  const games = useLiveQuery(() => db.games.toArray(), [], undefined);

  useEffect(() => {
    void loadTree().then(setTree);
  }, []);

  const moves = lineMoves(line);
  const fens = useMemo(() => fensOf(path), [path]);
  const onLine = path.slice(0, ply).every((m, i) => m === moves[i]);
  const note = onLine && ply > 0 ? line.notes[ply] : undefined;
  const sans = path;
  const go = (p: number) => setPly(Math.max(0, Math.min(path.length, p)));

  // Narration : le coup affiché et son commentaire, une fois par coup.
  useEffect(() => {
    if (!narration || ply === 0 || drill) return;
    const t = setTimeout(() => void speak(`${spokenSan(path[ply - 1])}.${note ? ` ${note}` : ''}`), 250);
    return () => {
      clearTimeout(t);
      stopSpeaking();
    };
  }, [ply, path, narration, note, drill]);

  useEffect(() => {
    if (drill) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') go(ply + 1);
      else if (e.key === 'ArrowLeft') go(ply - 1);
      else if (e.key === 'ArrowUp') go(0);
      else if (e.key === 'ArrowDown') go(path.length);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const choose = (l: TheoryLine) => {
    setLine(l);
    setPath(lineMoves(l));
    setPly(0);
    setDrill(false);
  };

  // Suite choisie : on suit la ligne étudiée tant que c'est possible, sinon on explore.
  const play = (san: string) => {
    const next = [...path.slice(0, ply), san];
    const follows = next.every((m, i) => m === moves[i]);
    setPath(follows ? moves : next);
    setPly(ply + 1);
  };

  const fen = fens[ply];
  const lineNext = onLine ? moves[ply] : undefined;
  const next = tree ? suggestions(tree, fen, lineNext, line.name) : [];
  const last = ply > 0 ? new Chess(fens[ply - 1]).move(path[ply - 1]) : undefined;
  const placeName = !note && ply > 0 && tree ? suggestions(tree, fens[ply - 1]).find((s) => s.san === path[ply - 1])?.name : undefined;

  const mine = (games ?? []).filter((g) => gameInOpening(g, opening) && (!usernames.length || myResult(g, usernames).kind !== 'none'));
  const points = mine.reduce((a, g) => {
    const r = myResult(g, usernames).kind;
    return a + (r === 'win' ? 1 : r === 'draw' ? 0.5 : 0);
  }, 0);
  const scored = mine.filter((g) => usernames.length && myResult(g, usernames).kind !== 'none').length;

  return (
    <div className="screen theory-screen" data-testid="opening-view">
      <header className="screen-head">
        <button type="button" className="back-btn" onClick={onBack}>
          ← Théorie
        </button>
        <h1 className="session-title">{opening.name}</h1>
        <span className="muted small">{opening.eco}</span>
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
          <Icon name={narration ? 'speaker' : 'mute'} />
        </button>
      </header>
      <div className="chips-row line-chips" role="radiogroup" aria-label="Ligne">
        {[opening.main, ...opening.variations].map((l, i) => (
          <button type="button" key={l.name} role="radio" aria-checked={l === line} className={`chip ${l === line ? 'active' : ''}`} onClick={() => choose(l)}>
            {i === 0 ? `Ligne principale : ${l.name}` : l.name}
          </button>
        ))}
      </div>
      {drill ? (
        <LineDrill key={line.name} opening={opening} line={line} onExit={() => setDrill(false)} />
      ) : (
        <div className="challenge-layout">
          <div className="puzzle-board">
            <Board
              fen={fen}
              flipped={opening.side === 'b'}
              lastMove={last ? { from: last.from, to: last.to } : undefined}
              arrows={lineNext ? [{ from: new Chess(fen).move(lineNext).from, to: new Chess(fen).move(lineNext).to, kind: 'best' }] : []}
              coordinates={coordinates}
              onSwipe={(d) => go(ply + d)}
            />
            <nav className="move-nav theory-nav" aria-label="Navigation dans la ligne">
              <button type="button" className="icon-btn" aria-label="Début" onClick={() => go(0)} disabled={ply === 0}>
                <Icon name="first" />
              </button>
              <button type="button" className="icon-btn" aria-label="Coup précédent" onClick={() => go(ply - 1)} disabled={ply === 0}>
                <Icon name="prev" />
              </button>
              <button type="button" className="icon-btn" aria-label="Coup suivant" onClick={() => go(ply + 1)} disabled={ply >= path.length}>
                <Icon name="next" />
              </button>
              <button type="button" className="icon-btn" aria-label="Fin" onClick={() => go(path.length)} disabled={ply >= path.length}>
                <Icon name="last" />
              </button>
            </nav>
          </div>
          <div className="challenge-side settings-card">
            <p className="theory-moves" data-testid="theory-moves">
              {sans.map((s, i) => (
                <button type="button" key={i} className={`move-token ${i === ply - 1 ? 'now' : ''} ${line.notes[i + 1] && sans.slice(0, i + 1).every((m, k) => m === moves[k]) ? 'has-note' : ''}`} onClick={() => go(i + 1)}>
                  {i % 2 === 0 ? `${i / 2 + 1}. ` : ''}
                  {displaySan(s, notation)}
                </button>
              ))}
            </p>
            <p className="theory-note" data-testid="theory-note" aria-live="polite">
              {ply === 0 ? opening.summary : note ?? placeName ?? (onLine ? line.name : 'Hors de la ligne étudiée.')}
            </p>
            <div>
              <h2>Suites possibles</h2>
              {next.length ? (
                <ul className="next-moves" data-testid="next-moves">
                  {next.map((s) => (
                    <li key={s.san}>
                      <button type="button" className={`next-move ${s.inLine ? 'in-line' : ''}`} onClick={() => play(s.san)}>
                        <strong>{displaySan(s.san, notation)}</strong>
                        <span className="small">{shortName(s.name ?? (s.inLine ? line.name : ''))}</span>
                        <span className="muted small">{s.inLine ? 'ligne étudiée' : `${s.count} ligne${s.count > 1 ? 's' : ''}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">{tree ? 'Fin de la théorie répertoriée.' : 'Chargement…'}</p>
              )}
            </div>
            <div className="import-actions">
              <button type="button" className="primary" onClick={() => setDrill(true)}>
                M’entraîner sur cette ligne
              </button>
            </div>
            <div className="my-games" data-testid="my-games">
              <h2>Mes parties dans cette ouverture</h2>
              <p className="small">
                {mine.length === 0
                  ? 'Aucune partie pour l’instant.'
                  : `${mine.length} partie${mine.length > 1 ? 's' : ''}${scored ? ` · score ${String(points).replace('.', ',')} / ${scored} (${Math.round((points / scored) * 100)} %)` : ''}`}
              </p>
              {mine.length > 0 && (
                <button type="button" className="link-btn" onClick={() => useReview.getState().openLibrary({ opening: opening.id })}>
                  Voir dans la bibliothèque
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** « M'entraîner sur cette ligne » : l'app joue l'adversaire, tu retrouves les coups de ton camp. */
function LineDrill({ opening, line, onExit }: { opening: TheoryOpening; line: TheoryLine; onExit: () => void }) {
  const { coordinates, notation, narration } = useSettings();
  const moves = lineMoves(line);
  const fens = useMemo(() => fensOf(moves), [moves]);
  const mySide = opening.side;
  const firstMine = mySide === 'w' ? 0 : 1;
  const [ply, setPly] = useState(firstMine);
  const [selected, setSelected] = useState<string | undefined>();
  const [errors, setErrors] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [showArrow, setShowArrow] = useState(false);
  const done = ply >= moves.length;
  const fen = fens[Math.min(ply, moves.length)];
  const board = new Chess(fen);
  const say = (t: string) => narration && void speak(t);

  useEffect(() => () => stopSpeaking(), []);

  const onTap = (sq: string) => {
    if (done) return;
    if (selected) {
      const m = board.moves({ square: selected as Square, verbose: true }).find((x) => x.to === sq);
      if (m) {
        setSelected(undefined);
        const expected = moves[ply];
        if (m.san === expected) {
          const note = line.notes[ply + 1];
          setFeedback({ ok: true, text: note ?? 'Coup théorique.' });
          say(note ?? 'Coup théorique.');
          setShowArrow(false);
          // Le coup adverse suit automatiquement.
          setPly(Math.min(moves.length, ply + 2));
        } else {
          setErrors((e) => e + 1);
          const text = `Le coup théorique est ${displaySan(expected, notation)}.${line.notes[ply + 1] ? ` ${line.notes[ply + 1]}` : ''}`;
          setFeedback({ ok: false, text });
          say(text);
          setShowArrow(true);
        }
        return;
      }
    }
    const piece = board.get(sq as Square);
    setSelected(piece && piece.color === board.turn() && sq !== selected ? sq : undefined);
  };

  const expected = !done ? new Chess(fen).move(moves[ply]) : undefined;
  const arrows: Arrow[] = showArrow && expected ? [{ from: expected.from, to: expected.to, kind: 'best' }] : [];
  const prevMove = ply > 0 ? new Chess(fens[ply - 1]).move(moves[ply - 1]) : undefined;
  const targets = selected ? board.moves({ square: selected as Square, verbose: true }).map((m) => m.to) : [];
  const total = moves.filter((_, i) => i % 2 === firstMine).length;
  const found = Math.min(total, Math.floor((ply - firstMine) / 2));

  return (
    <div className="challenge-layout" data-testid="line-drill" data-ply={ply} data-line={moves.join(' ')}>
      <div className="puzzle-board">
        <Board fen={fen} flipped={mySide === 'b'} lastMove={prevMove ? { from: prevMove.from, to: prevMove.to } : undefined} arrows={arrows} coordinates={coordinates} onSquareTap={onTap} selected={selected} targets={targets} />
      </div>
      <div className="challenge-side settings-card">
        <p className="puzzle-prompt">
          <span className={`turn-dot ${mySide}`} aria-hidden="true" /> Joue les coups des {mySide === 'w' ? 'blancs' : 'noirs'} : {line.name}.
        </p>
        <p className="muted small">
          Coup {Math.min(found + 1, total)} sur {total} · {errors} erreur{errors > 1 ? 's' : ''}
        </p>
        {feedback && (
          <p className={`step-note ${feedback.ok ? 'note-good' : 'note-wrong'}`} role="status">
            {feedback.text}
          </p>
        )}
        {done && (
          <div className={`report ${errors ? 'warn' : 'ok'}`} role="status" data-testid="drill-done">
            <p>
              <strong>Ligne terminée</strong> · {errors === 0 ? 'sans erreur' : `${errors} erreur${errors > 1 ? 's' : ''}`}
            </p>
          </div>
        )}
        <div className="import-actions">
          {done && (
            <button
              type="button"
              className="primary"
              onClick={() => {
                setPly(firstMine);
                setErrors(0);
                setFeedback(null);
              }}
            >
              Recommencer
            </button>
          )}
          <button type="button" className="ghost" onClick={onExit}>
            Revenir à la ligne
          </button>
        </div>
      </div>
    </div>
  );
}
