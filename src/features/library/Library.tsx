import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { analyzeGame } from '../../analysis/analyzeGame';
import { formatAccuracy } from '../../analysis/accuracy';
import { getEngine } from '../../engine/stockfish';
import { decodeBytes, importPgn, parseGame, SPEED_LABEL, speedOf } from '../../pgn/parser';
import type { ImportError } from '../../pgn/types';
import { db, evalCache, type StoredGame } from '../../storage/db';
import { deleteGame, saveGames } from '../../storage/games';
import { Icon } from '../../ui/Icon';
import { useReview } from '../review/store';
import { useSettings } from '../settings/settings';
import { lichessGamePgn, parseGameLink } from './online';
import { networkMessage, OnlineImport } from './OnlineImport';
import { SAMPLE_PGN } from './sample';

const ROW_H = 68;

interface ImportReport {
  added: number;
  duplicates: number;
  errors: ImportError[];
}

export function Library() {
  const games = useLiveQuery(() => db.games.orderBy('importedAt').reverse().toArray(), [], undefined);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<'all' | 'win-w' | 'win-b' | 'draw'>('all');
  const [paste, setPaste] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const openGame = useReview((s) => s.openGame);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (games ?? []).filter((g) => {
      if (result === 'win-w' && g.result !== '1-0') return false;
      if (result === 'win-b' && g.result !== '0-1') return false;
      if (result === 'draw' && g.result !== '1/2-1/2') return false;
      if (!q) return true;
      return [g.white, g.black, g.opening, g.eco, g.date, SPEED_LABEL[speedOf(g.timeControl)]].some((v) => v?.toLowerCase().includes(q));
    });
  }, [games, query, result]);

  const [onlineDone, setOnlineDone] = useState<Set<string>>(new Set());

  const runImport = async (input: string) => {
    setBusy(true);
    setReport(null);
    let text = input;
    const link = parseGameLink(input);
    if (link) {
      if (link.site === 'chesscom') {
        setReport({ added: 0, duplicates: 0, errors: [{ gameIndex: 1, label: 'Lien chess.com', message: 'chess.com ne permet pas de récupérer une partie par son lien. Utilise « Depuis un site » avec ton pseudo, ou colle le PGN (Partager → PGN sur chess.com).' }] });
        setBusy(false);
        return;
      }
      try {
        text = await lichessGamePgn(link.id);
      } catch (e) {
        setReport({ added: 0, duplicates: 0, errors: [{ gameIndex: 1, label: 'Lien Lichess', message: networkMessage(e) }] });
        setBusy(false);
        return;
      }
    }
    // Laisse le navigateur afficher l'état « import en cours » avant le calcul.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { games: parsed, errors } = importPgn(text);
      const { added, duplicates } = await saveGames(parsed);
      setReport({ added: added.length, duplicates, errors });
      if (added.length === 1 && parsed.length === 1 && !errors.length) void openGame(added[0]);
    } finally {
      setBusy(false);
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    let text = '';
    for (const f of Array.from(files)) text += decodeBytes(await f.arrayBuffer()) + '\n\n';
    await runImport(text);
  };

  const analyzeSelection = async () => {
    const list = (games ?? []).filter((g) => selected.has(g.id));
    if (!list.length) return;
    const level = useSettings.getState().level;
    setBatch({ done: 0, total: list.length });
    for (let k = 0; k < list.length; k++) {
      const g = list[k];
      try {
        const parsed = parseGame(g.source);
        const analysis = await analyzeGame(parsed, { level, engine: getEngine(), cache: evalCache });
        await db.analyses.put({ key: `${g.id}|${level}`, gameId: g.id, analysis });
        await db.games.update(g.id, {
          accuracyWhite: analysis.white.accuracy ?? undefined,
          accuracyBlack: analysis.black.accuracy ?? undefined,
          analyzedLevel: level,
        });
      } catch {
        /* partie illisible : on passe à la suivante */
      }
      setBatch({ done: k + 1, total: list.length });
    }
    setBatch(null);
    setSelected(new Set());
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="library">
      <section
        className={`import-card ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void onFiles(e.dataTransfer.files);
        }}
      >
        <h2>Importer une partie</h2>
        <p className="muted">
          Fichier PGN exporté de chess.com ou Lichess (une ou plusieurs centaines de parties), PGN collé, liste de coups (française ou anglaise) ou position FEN.
        </p>
        <div className="import-actions">
          <button type="button" className="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="upload" /> Choisir un fichier
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pgn,.txt,application/x-chess-pgn,text/plain"
            multiple
            hidden
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" className="ghost" onClick={() => runImport(SAMPLE_PGN)} disabled={busy}>
            Essayer avec une partie d'exemple
          </button>
        </div>
        <label className="paste">
          <span className="sr-only">Coller un PGN, une liste de coups ou une FEN</span>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={'Colle ici un PGN, une liste de coups (1. e4 e5 2. Cf3 …), une FEN ou un lien Lichess'}
            rows={4}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={busy || !paste.trim()}
          onClick={async () => {
            await runImport(paste);
            setPaste('');
          }}
        >
          {busy ? 'Import en cours…' : 'Importer le texte collé'}
        </button>

        <OnlineImport
          importedIds={onlineDone}
          onImport={async (pgn, id) => {
            await runImport(pgn);
            setOnlineDone((prev) => new Set(prev).add(id));
          }}
        />

        {report && (
          <div className={report.errors.length ? 'report warn' : 'report ok'} role="status">
            <p>
              {report.added} partie{report.added > 1 ? 's' : ''} importée{report.added > 1 ? 's' : ''}
              {report.duplicates > 0 && ` · ${report.duplicates} doublon${report.duplicates > 1 ? 's' : ''} ignoré${report.duplicates > 1 ? 's' : ''}`}
              {report.errors.length > 0 && ` · ${report.errors.length} partie${report.errors.length > 1 ? 's' : ''} en erreur`}
            </p>
            {report.errors.length > 0 && (
              <ul>
                {report.errors.slice(0, 20).map((e) => (
                  <li key={e.gameIndex}>
                    Partie {e.gameIndex} ({e.label}){e.move ? `, coup ${e.move}` : ''} : {e.message}
                  </li>
                ))}
                {report.errors.length > 20 && <li>… et {report.errors.length - 20} autres</li>}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="games-card">
        <div className="games-head">
          <h2>Bibliothèque {games && <span className="muted">({games.length})</span>}</h2>
          <div className="filters">
            <label className="search">
              <Icon name="search" size={18} />
              <span className="sr-only">Rechercher</span>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Joueur, ouverture, cadence, date…" />
            </label>
            <select value={result} onChange={(e) => setResult(e.target.value as typeof result)} aria-label="Filtrer par résultat">
              <option value="all">Tous les résultats</option>
              <option value="win-w">Gain des blancs</option>
              <option value="win-b">Gain des noirs</option>
              <option value="draw">Nulles</option>
            </select>
          </div>
          {selected.size > 0 && (
            <div className="batch-bar">
              <span>{selected.size} sélectionnée{selected.size > 1 ? 's' : ''}</span>
              <button type="button" className="primary" onClick={analyzeSelection} disabled={!!batch}>
                {batch ? `Analyse ${batch.done} / ${batch.total}…` : 'Analyser la sélection'}
              </button>
              <button type="button" className="ghost" onClick={() => setSelected(new Set())} disabled={!!batch}>
                Annuler
              </button>
            </div>
          )}
        </div>
        {games === undefined ? null : games.length === 0 ? (
          <p className="empty-state">Aucune partie pour l'instant. Importe un fichier PGN ou essaie la partie d'exemple.</p>
        ) : (
          <VirtualList
            items={filtered}
            render={(g) => (
              <GameRow
                key={g.id}
                g={g}
                selected={selected.has(g.id)}
                onToggle={() => toggle(g.id)}
                onOpen={() => openGame(g)}
                onDelete={() => deleteGame(g.id)}
              />
            )}
          />
        )}
      </section>
    </div>
  );
}

function VirtualList({ items, render }: { items: StoredGame[]; render: (g: StoredGame) => React.ReactNode }) {
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(600);
  const start = Math.max(0, Math.floor(scroll / ROW_H) - 5);
  const end = Math.min(items.length, Math.ceil((scroll + height) / ROW_H) + 5);
  return (
    <div
      className="virtual-list"
      ref={(el) => {
        if (el && el.clientHeight && el.clientHeight !== height) setHeight(el.clientHeight);
      }}
      onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * ROW_H, position: 'relative' }}>
        <div style={{ transform: `translateY(${start * ROW_H}px)` }}>{items.slice(start, end).map(render)}</div>
      </div>
    </div>
  );
}

function resultText(r: string) {
  return r === '1/2-1/2' ? '½–½' : r === '*' ? '–' : r.replace('-', '–');
}

function GameRow({ g, selected, onToggle, onOpen, onDelete }: { g: StoredGame; selected: boolean; onToggle: () => void; onOpen: () => void; onDelete: () => void }) {
  const speed = SPEED_LABEL[speedOf(g.timeControl)];
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="game-row" style={{ height: ROW_H }}>
      <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Sélectionner ${g.white} contre ${g.black}`} />
      <button type="button" className="game-main" onClick={onOpen}>
        <span className="game-players">
          <span className="dot white" aria-hidden="true" /> {g.white} {g.whiteElo && <span className="muted">({g.whiteElo})</span>}
          <span className="vs">–</span>
          <span className="dot black" aria-hidden="true" /> {g.black} {g.blackElo && <span className="muted">({g.blackElo})</span>}
        </span>
        <span className="game-meta muted">
          {resultText(g.result)} · {speed} · {Math.ceil(g.plies / 2)} coups{g.date ? ` · ${g.date.replace(/\./g, '/')}` : ''}
          {g.opening ? ` · ${g.opening}` : ''}
        </span>
      </button>
      <span className="game-acc" title="Précision blancs / noirs">
        {g.accuracyWhite !== undefined ? (
          <>
            {formatAccuracy(g.accuracyWhite)}
            <br />
            {formatAccuracy(g.accuracyBlack)}
          </>
        ) : (
          <span className="muted small">non analysée</span>
        )}
      </span>
      {confirming ? (
        <button type="button" className="ghost danger" onClick={onDelete} onBlur={() => setConfirming(false)} autoFocus>
          Supprimer ?
        </button>
      ) : (
        <button type="button" className="icon-btn subtle" aria-label={`Supprimer ${g.white} contre ${g.black}`} onClick={() => setConfirming(true)}>
          <Icon name="trash" size={18} />
        </button>
      )}
    </div>
  );
}
