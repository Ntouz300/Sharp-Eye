import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatAccuracy } from '../../analysis/accuracy';
import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { decodeBytes, importPgn, SPEED_LABEL, speedOf, type Speed } from '../../pgn/parser';
import type { ImportError } from '../../pgn/types';
import { db, type GameOrigin, type StoredGame } from '../../storage/db';
import { deleteGame, findDuplicate, saveGames } from '../../storage/games';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useToast } from '../../ui/toast';
import { useSync } from '../account/chesscom';
import { PositionEditor } from '../position/PositionEditor';
import { useReview } from '../review/store';
import { useSettings } from '../settings/settings';
import { estimateMs, formatDuration, LEVELS, useBatch } from './batch';
import { lichessGamePgn, parseGameLink } from './online';
import { networkMessage, OnlineImport } from './OnlineImport';
import { SAMPLE_PGN } from './sample';

const ROW_H = 76;

export const ORIGIN_LABEL: Record<GameOrigin, string> = { chesscom: 'chess.com', lichess: 'Lichess', pgn: 'PGN', position: 'Position' };

type ResultFilter = 'all' | 'win' | 'loss' | 'draw';
type StateFilter = 'all' | 'analyzed' | 'pending';
interface Filters {
  speed: Speed | 'all';
  result: ResultFilter;
  origin: GameOrigin | 'all';
  state: StateFilter;
}
const NO_FILTERS: Filters = { speed: 'all', result: 'all', origin: 'all', state: 'all' };

/** Résultat vu par l'utilisateur quand on sait quel camp il joue, sinon par les blancs. */
export function myResult(g: StoredGame, me: string[]): { text: string; kind: 'win' | 'loss' | 'draw' | 'none' } {
  const names = me.map((n) => n.toLowerCase());
  const side = names.includes(g.white.toLowerCase()) ? 'w' : names.includes(g.black.toLowerCase()) ? 'b' : null;
  if (g.result === '1/2-1/2') return { text: 'Nulle', kind: 'draw' };
  if (g.result === '*') return { text: 'En cours', kind: 'none' };
  const whiteWon = g.result === '1-0';
  if (!side) return { text: whiteWon ? 'Gain des blancs' : 'Gain des noirs', kind: 'none' };
  return (side === 'w') === whiteWon ? { text: 'Gain', kind: 'win' } : { text: 'Perte', kind: 'loss' };
}

export function GamesScreen() {
  const games = useLiveQuery(() => db.games.orderBy('importedAt').reverse().toArray(), [], undefined);
  const me = useSettings((s) => s.usernames);
  const openGame = useReview((s) => s.openGame);
  const setTab = useReview((s) => s.setTab);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sheet, setSheet] = useState<'import' | 'filters' | 'batch' | null>(null);
  const [editor, setEditor] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (games ?? []).filter((g) => {
      if (filters.speed !== 'all' && speedOf(g.timeControl) !== filters.speed) return false;
      if (filters.origin !== 'all' && (g.origin ?? 'pgn') !== filters.origin) return false;
      if (filters.state === 'analyzed' && g.analyzedLevel === undefined) return false;
      if (filters.state === 'pending' && g.analyzedLevel !== undefined) return false;
      if (filters.result !== 'all' && myResult(g, me).kind !== filters.result) return false;
      if (!q) return true;
      return [g.white, g.black, g.opening, g.eco, g.date].some((v) => v?.toLowerCase().includes(q));
    });
  }, [games, query, filters, me]);

  const activeFilters = Object.entries(filters).filter(([, v]) => v !== 'all').length;
  const pending = filtered.filter((g) => g.analyzedLevel === undefined && !g.unanalyzable);
  const batchTargets = selecting && selected.size ? filtered.filter((g) => selected.has(g.id) && g.analyzedLevel === undefined && !g.unanalyzable) : pending;

  if (editor)
    return (
      <PositionEditor
        onClose={() => setEditor(false)}
        onAnalyze={async (fen) => {
          const g = importPgn(`[SetUp "1"]\n[FEN "${fen}"]\n[Event "Position étudiée"]\n\n*`).games[0];
          if (!g) return;
          const stored = (await findDuplicate(g)) ?? (await saveGames([g])).added[0];
          if (stored) {
            setEditor(false);
            await openGame(stored);
          }
        }}
      />
    );

  return (
    <div className="screen games-screen">
      <header className="screen-head">
        <h1>
          Parties {games && games.length > 0 && <span className="count">{games.length}</span>}
        </h1>
        <div className="head-actions">
          <button type="button" className="icon-btn subtle" onClick={() => setSheet('filters')} aria-label={`Filtres${activeFilters ? ` (${activeFilters} actifs)` : ''}`}>
            <Icon name="filter" />
            {activeFilters > 0 && <span className="dot-badge">{activeFilters}</span>}
          </button>
          <button
            type="button"
            className={`icon-btn subtle ${selecting ? 'active' : ''}`}
            aria-pressed={selecting}
            aria-label="Sélectionner des parties"
            onClick={() => {
              setSelecting(!selecting);
              setSelected(new Set());
            }}
          >
            <Icon name="check" />
          </button>
          <button type="button" className="primary" onClick={() => setSheet('import')}>
            <Icon name="plus" /> Importer
          </button>
        </div>
      </header>

      <SyncLine />
      <BatchBanner />

      {games && games.length > 0 && (
        <div className="list-tools">
          <label className="search">
            <Icon name="search" size={18} />
            <span className="sr-only">Rechercher</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Joueur, ouverture, date…" />
          </label>
          {batchTargets.length > 0 && !useBatch.getState().queue.length && (
            <button type="button" className="ghost" onClick={() => setSheet('batch')}>
              {selecting && selected.size ? `Analyser la sélection (${batchTargets.length})` : `Analyser toutes les parties (${batchTargets.length})`}
            </button>
          )}
        </div>
      )}

      {selecting && (
        <div className="select-bar">
          <span>
            {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
          </span>
          <button type="button" className="link-btn" onClick={() => setSelected(new Set(filtered.map((g) => g.id)))}>
            Tout
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="ghost danger"
              onClick={async () => {
                for (const id of selected) await deleteGame(id);
                setSelected(new Set());
                setConfirmDelete(false);
              }}
            >
              Confirmer la suppression
            </button>
          ) : (
            <button type="button" className="ghost" disabled={!selected.size} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={18} /> Supprimer
            </button>
          )}
        </div>
      )}

      {games === undefined ? null : games.length === 0 ? (
        <Welcome onImport={() => setSheet('import')} onAccount={() => setTab('profile')} />
      ) : filtered.length === 0 ? (
        <p className="empty-state">Aucune partie ne correspond. {activeFilters > 0 && <button type="button" className="link-btn" onClick={() => setFilters(NO_FILTERS)}>Effacer les filtres</button>}</p>
      ) : (
        <VirtualList
          items={filtered}
          render={(g) => (
            <GameCard
              key={g.id}
              g={g}
              me={me}
              selecting={selecting}
              selected={selected.has(g.id)}
              onOpen={() => {
                if (!selecting) return void openGame(g);
                const next = new Set(selected);
                if (next.has(g.id)) next.delete(g.id);
                else next.add(g.id);
                setSelected(next);
              }}
            />
          )}
        />
      )}

      {sheet === 'import' && (
        <ImportSheet
          onClose={() => setSheet(null)}
          onEditor={() => {
            setSheet(null);
            setEditor(true);
          }}
        />
      )}
      {sheet === 'filters' && <FiltersSheet value={filters} onChange={setFilters} onClose={() => setSheet(null)} />}
      {sheet === 'batch' && (
        <BatchSheet
          games={batchTargets}
          onClose={() => setSheet(null)}
          onStart={(level) => {
            // Les plus récentes d'abord (ordre de la liste).
            useBatch.getState().start(
              batchTargets.map((g) => g.id),
              level,
            );
            setSheet(null);
            setSelecting(false);
          }}
        />
      )}
    </div>
  );
}

function Welcome({ onImport, onAccount }: { onImport: () => void; onAccount: () => void }) {
  return (
    <div className="welcome">
      <img src="./icons/icon.svg" width="72" height="72" alt="" />
      <h2>Bienvenue dans Sharp Eye</h2>
      <p className="muted">Relie ton compte chess.com : tes parties arriveront seules. L’analyse commence quand tu ouvres une partie.</p>
      <button type="button" className="primary big" onClick={onAccount}>
        Relier mon compte chess.com
      </button>
      <button type="button" className="ghost" onClick={onImport}>
        Importer une partie
      </button>
    </div>
  );
}

function SyncLine() {
  const { running, progress, message } = useSync();
  const sync = useSync((s) => s.sync);
  const account = useLiveQuery(() => db.kv.get('chesscom'), [], undefined)?.value as { username: string; lastSync?: number } | undefined;
  if (!account) return null;
  return (
    <div className="sync-line" role="status">
      <span className="source-pill chesscom">chess.com</span>
      <span className="muted small">
        {running
          ? progress
            ? `Synchronisation : mois ${progress.monthIndex + 1} sur ${progress.months} (${progress.month}) · ${progress.added} nouvelle${progress.added > 1 ? 's' : ''}`
            : 'Synchronisation…'
          : (message ?? (account.lastSync ? `${account.username} · à jour ${timeAgo(account.lastSync)}` : account.username))}
      </span>
      <button type="button" className="icon-btn subtle small-btn" onClick={() => void sync()} disabled={running} aria-label="Synchroniser maintenant">
        <Icon name="sync" size={18} />
      </button>
    </div>
  );
}

export function timeAgo(t: number) {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `le ${new Date(t).toLocaleDateString('fr-FR')}`;
}

function BatchBanner() {
  const { queue, total, done, paused, pausedForReview, level } = useBatch();
  const games = useLiveQuery(() => (queue.length ? db.games.bulkGet(queue) : []), [queue.join(',')], []);
  if (!total) return null;
  const left = formatDuration(estimateMs((games as (StoredGame | undefined)[]).filter((g): g is StoredGame => !!g), level));
  return (
    <div className="batch-banner" role="status">
      <div className="banner-row">
        <span>
          <strong>
            {done} / {total} parties
          </strong>{' '}
          · {paused ? (pausedForReview ? 'en pause pendant la revue' : 'en pause') : `${left} restantes`} · {REVIEW_LEVELS[level].label}
        </span>
        <span className="banner-actions">
          {paused ? (
            <button type="button" className="link-btn" onClick={() => useBatch.getState().resume()}>
              Reprendre
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => useBatch.getState().pause()}>
              Pause
            </button>
          )}
          <button type="button" className="link-btn" onClick={() => useBatch.getState().cancel()}>
            Annuler
          </button>
        </span>
      </div>
      <div className="progress-bar">
        <div style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  );
}

function BatchSheet({ games, onStart, onClose }: { games: StoredGame[]; onStart: (l: ReviewLevel) => void; onClose: () => void }) {
  const [level, setLevel] = useState<ReviewLevel>(useSettings.getState().batchLevel);
  return (
    <Sheet title={`Analyser ${games.length} partie${games.length > 1 ? 's' : ''}`} onClose={onClose} side="bottom">
      <p className="muted small">Une partie à la fois, les plus récentes d’abord. Tu peux continuer à utiliser l’app ; ouvrir une partie l’analyse en priorité.</p>
      <div className="level-list" role="radiogroup" aria-label="Niveau d’analyse">
        {LEVELS.map((l) => (
          <button type="button" role="radio" aria-checked={level === l} key={l} className={`level-option ${level === l ? 'active' : ''}`} onClick={() => setLevel(l)}>
            <strong>{REVIEW_LEVELS[l].label}</strong>
            <span className="muted small">
              profondeur {REVIEW_LEVELS[l].depth} · {formatDuration(estimateMs(games, l))}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="primary big" onClick={() => onStart(level)}>
        Lancer l’analyse
      </button>
    </Sheet>
  );
}

function FiltersSheet({ value, onChange, onClose }: { value: Filters; onChange: (f: Filters) => void; onClose: () => void }) {
  const group = <K extends keyof Filters>(key: K, label: string, options: [Filters[K], string][]) => (
    <fieldset className="filter-group">
      <legend>{label}</legend>
      <div className="chips-row">
        {options.map(([v, l]) => (
          <button type="button" key={String(v)} className={`chip ${value[key] === v ? 'active' : ''}`} aria-pressed={value[key] === v} onClick={() => onChange({ ...value, [key]: v })}>
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <Sheet title="Filtres" onClose={onClose}>
      {group('speed', 'Cadence', [
        ['all', 'Toutes'],
        ['bullet', SPEED_LABEL.bullet],
        ['blitz', SPEED_LABEL.blitz],
        ['rapid', SPEED_LABEL.rapid],
        ['classical', SPEED_LABEL.classical],
        ['correspondence', SPEED_LABEL.correspondence],
      ])}
      {group('result', 'Résultat', [
        ['all', 'Tous'],
        ['win', 'Gains'],
        ['loss', 'Pertes'],
        ['draw', 'Nulles'],
      ])}
      {group('origin', 'Source', [
        ['all', 'Toutes'],
        ['chesscom', 'chess.com'],
        ['lichess', 'Lichess'],
        ['pgn', 'PGN'],
        ['position', 'Position'],
      ])}
      {group('state', 'Analyse', [
        ['all', 'Toutes'],
        ['analyzed', 'Analysées'],
        ['pending', 'Non analysées'],
      ])}
      <button type="button" className="ghost" onClick={() => onChange(NO_FILTERS)}>
        Effacer les filtres
      </button>
    </Sheet>
  );
}

interface ImportReport {
  added: number;
  duplicates: number;
  errors: ImportError[];
}

function ImportSheet({ onClose, onEditor }: { onClose: () => void; onEditor: () => void }) {
  const openGame = useReview((s) => s.openGame);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [onlineDone, setOnlineDone] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const runImport = async (input: string) => {
    setBusy(true);
    setReport(null);
    let text = input;
    const link = parseGameLink(input);
    if (link) {
      if (link.site === 'chesscom') {
        setReport({ added: 0, duplicates: 0, errors: [{ gameIndex: 1, label: 'Lien chess.com', message: 'chess.com ne permet pas de récupérer une partie par son lien. Relie ton compte dans Profil, ou colle le PGN.' }] });
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
    await new Promise((r) => setTimeout(r, 30));
    try {
      const { games: parsed, errors } = importPgn(text);
      const { added, duplicates } = await saveGames(parsed);
      setReport({ added: added.length, duplicates, errors });
      if (added.length === 1 && parsed.length === 1 && !errors.length) {
        onClose();
        void openGame(added[0]);
      } else if (added.length && !errors.length) {
        useToast.getState().show(`${added.length} parties importées.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Importer" onClose={onClose}>
      <div className="import-options">
        <button type="button" className="option-row" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="upload" />
          <span>
            <strong>Fichier PGN</strong>
            <span className="muted small">Export chess.com ou Lichess, une ou plusieurs centaines de parties</span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pgn,.txt,application/x-chess-pgn,text/plain"
          multiple
          hidden
          onChange={async (e) => {
            const files = e.target.files;
            e.target.value = '';
            if (!files?.length) return;
            let text = '';
            for (const f of Array.from(files)) text += decodeBytes(await f.arrayBuffer()) + '\n\n';
            await runImport(text);
          }}
        />
        <button type="button" className="option-row" onClick={onEditor}>
          <Icon name="board" />
          <span>
            <strong>Position (image ou éditeur)</strong>
            <span className="muted small">Capture d’écran d’un échiquier, ou pièces placées à la main</span>
          </span>
        </button>
        <button type="button" className="option-row" onClick={() => runImport(SAMPLE_PGN)} disabled={busy}>
          <Icon name="star" />
          <span>
            <strong>Partie d’exemple</strong>
            <span className="muted small">La partie de l’Opéra (Morphy, 1858)</span>
          </span>
        </button>
      </div>

      <label className="paste">
        <span className="small">Coller un PGN, une liste de coups, une FEN ou un lien Lichess</span>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="1. e4 e5 2. Cf3 …" rows={3} spellCheck={false} autoCapitalize="off" autoCorrect="off" />
      </label>
      <button
        type="button"
        className="primary"
        disabled={!paste.trim() || busy}
        onClick={async () => {
          await runImport(paste);
          setPaste('');
        }}
      >
        {busy ? 'Import en cours…' : 'Importer le texte'}
      </button>

      <details className="fold">
        <summary>Depuis un pseudo (sans relier de compte)</summary>
        <OnlineImport
          importedIds={onlineDone}
          onImport={async (pgn, id) => {
            await runImport(pgn);
            setOnlineDone((prev) => new Set(prev).add(id));
          }}
        />
      </details>

      {report && (
        <div className={report.errors.length ? 'notice warn' : 'notice ok'} role="status">
          <p>
            {report.added} partie{report.added > 1 ? 's' : ''} importée{report.added > 1 ? 's' : ''}
            {report.duplicates > 0 && ` · ${report.duplicates} doublon${report.duplicates > 1 ? 's' : ''} ignoré${report.duplicates > 1 ? 's' : ''}`}
            {report.errors.length > 0 && ` · ${report.errors.length} en erreur`}
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
    </Sheet>
  );
}

function VirtualList({ items, render }: { items: StoredGame[]; render: (g: StoredGame) => React.ReactNode }) {
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(700);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight || 700));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const start = Math.max(0, Math.floor(scroll / ROW_H) - 5);
  const end = Math.min(items.length, Math.ceil((scroll + height) / ROW_H) + 5);
  return (
    <div className="virtual-list" ref={ref} onScroll={(e) => setScroll(e.currentTarget.scrollTop)}>
      <div style={{ height: items.length * ROW_H, position: 'relative' }}>
        <div style={{ transform: `translateY(${start * ROW_H}px)` }}>{items.slice(start, end).map(render)}</div>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.replace(/[_\-.]+/g, ' ').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function GameCard({ g, me, selecting, selected, onOpen }: { g: StoredGame; me: string[]; selecting: boolean; selected: boolean; onOpen: () => void }) {
  const names = me.map((n) => n.toLowerCase());
  const mySide = names.includes(g.white.toLowerCase()) ? 'w' : names.includes(g.black.toLowerCase()) ? 'b' : null;
  const opponent = mySide === 'w' ? g.black : mySide === 'b' ? g.white : null;
  const res = myResult(g, me);
  const current = useReview((s) => (s.progress && s.stored?.id === g.id ? s.progress : null));
  const batchCurrent = useBatch((s) => s.current === g.id && !s.paused);
  const origin = g.origin ?? 'pgn';
  let state: React.ReactNode;
  if (current || batchCurrent) state = <span className="state-pill running">Analyse en cours</span>;
  else if (g.unanalyzable) state = <span className="state-pill">Non analysable</span>;
  else if (g.analyzedLevel !== undefined) {
    const acc = mySide === 'b' ? g.accuracyBlack : mySide === 'w' ? g.accuracyWhite : undefined;
    state =
      acc !== undefined ? (
        <span className="acc-pill">{formatAccuracy(acc)}</span>
      ) : (
        <span className="acc-pill two">
          {formatAccuracy(g.accuracyWhite)} · {formatAccuracy(g.accuracyBlack)}
        </span>
      );
  } else state = <span className="state-pill">{origin === 'chesscom' && !g.opened ? 'Nouvelle' : 'Non analysée'}</span>;
  const date = g.date && !g.date.startsWith('?') ? g.date.replace(/\./g, '/') : '';
  return (
    <div className="game-card-wrap" style={{ height: ROW_H }}>
      <button type="button" className={`game-card ${selected ? 'selected' : ''}`} onClick={onOpen} aria-pressed={selecting ? selected : undefined}>
        {selecting && <span className={`check ${selected ? 'on' : ''}`} aria-hidden="true" />}
        <span className={`avatar-md ${mySide ? (mySide === 'w' ? 'b' : 'w') : ''}`} aria-hidden="true">
          {initials(opponent ?? g.white)}
        </span>
        <span className="card-main">
          <span className="card-title">{opponent ? `contre ${opponent}` : `${g.white} – ${g.black}`}</span>
          <span className="card-meta">
            <span className={`result-tag ${res.kind}`}>{res.text}</span>
            <span>{SPEED_LABEL[speedOf(g.timeControl)]}</span>
            {date && <span>{date}</span>}
            <span className={`source-pill ${origin}`}>{ORIGIN_LABEL[origin]}</span>
          </span>
        </span>
        <span className="card-state">{state}</span>
      </button>
    </div>
  );
}
