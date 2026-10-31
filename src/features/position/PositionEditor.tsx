import { validateFen } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import { Board, PIECE_URL } from '../../board/Board';
import { Icon } from '../../ui/Icon';
import { pieceName } from '../../ui/notation';
import { PlayMode } from '../review/TrainingModes';
import { useSettings } from '../settings/settings';
import { imageFromBlob, pieceTemplates } from './loadImage';
import { castlingFor, placementFrom, recognize, type Grid } from './recognize';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const FILES = 'abcdefgh';
const PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];

type Squares = (string | null)[][]; // [rangée 8..1][colonne a..h]

function toSquares(placement: string): Squares {
  return placement.split('/').map((row) => {
    const out: (string | null)[] = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push(ch);
    }
    return out;
  });
}

/** Éditeur de position, rempli à la main ou depuis une capture d'écran. */
export function PositionEditor({ onAnalyze, onClose }: { onAnalyze: (fen: string) => void; onClose: () => void }) {
  const { coordinates } = useSettings();
  const [squares, setSquares] = useState<Squares>(() => toSquares(START));
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const [tool, setTool] = useState<string>('P');
  const [flipped, setFlipped] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; w: number; h: number; grid: Grid | null; doubtful: string[] } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const placement = placementFrom(squares, true);
  const fen = `${placement} ${turn} ${castlingFor(placement)} - 0 1`;
  const check = validateFen(fen);
  const kings = (placement.match(/K/g)?.length ?? 0) === 1 && (placement.match(/k/g)?.length ?? 0) === 1;
  const valid = check.ok && kings;

  const readImage = async (blob: Blob) => {
    setStatus('Lecture de l’image…');
    try {
      const [{ img, url }, templates] = await Promise.all([imageFromBlob(blob), pieceTemplates()]);
      await new Promise((r) => setTimeout(r, 20));
      const rec = recognize(img, templates);
      if (!rec) {
        setPhoto({ url, w: img.width, h: img.height, grid: null, doubtful: [] });
        setStatus('Échiquier introuvable sur cette image. Recadre la capture sur l’échiquier, ou place les pièces à la main.');
        return;
      }
      const read = rec.squares.map((row) => row.map((s) => s.piece));
      const oriented = rec.whiteAtBottom ? read : [...read].reverse().map((r) => [...r].reverse());
      const doubtful: string[] = [];
      rec.squares.forEach((row, r) =>
        row.forEach((s, f) => {
          if (s.piece && s.confidence < 0.35) {
            const rr = rec.whiteAtBottom ? r : 7 - r;
            const ff = rec.whiteAtBottom ? f : 7 - f;
            doubtful.push(FILES[ff] + (8 - rr));
          }
        }),
      );
      setSquares(oriented);
      setFlipped(!rec.whiteAtBottom);
      setPhoto({ url, w: img.width, h: img.height, grid: rec.grid, doubtful });
      const n = read.flat().filter(Boolean).length;
      setStatus(`${n} pièces reconnues. Vérifie la position et touche une case pour la corriger.${doubtful.length ? ` Cases à vérifier : ${doubtful.join(', ')}.` : ''}`);
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  // Coller une capture d'écran (⌘V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const f = item?.getAsFile();
      if (f) {
        e.preventDefault();
        void readImage(f);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const onSquareTap = (sq: string) => {
    const f = FILES.indexOf(sq[0]);
    const r = 8 - Number(sq[1]);
    const next = squares.map((row) => [...row]);
    next[r][f] = tool === 'x' || next[r][f] === tool ? null : tool;
    setSquares(next);
  };

  if (playing) return <PlayMode startFen={fen} onExit={() => setPlaying(false)} />;

  const errorText = !kings ? 'Il faut exactement un roi blanc et un roi noir.' : !check.ok ? 'Position impossible : ' + check.error : null;

  return (
    <div className="training position-editor">
      <div className="training-board">
        <Board fen={fen} flipped={flipped} coordinates={coordinates} onSquareTap={onSquareTap} targets={photo?.doubtful} />
      </div>
      <div className="training-side settings-card">
        <h2>Position</h2>
        <div className="import-actions">
          <button type="button" className="primary" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" /> Depuis une image
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void readImage(f);
            }}
          />
        </div>
        <p className="muted small">Capture d’écran d’un échiquier en 2D (chess.com, Lichess, livre numérique). Tu peux aussi la coller avec ⌘V. Les photos d’un vrai échiquier ne sont pas reconnues : place alors les pièces à la main.</p>
        {photo && (
          <div className="photo-preview">
            <img src={photo.url} alt="Image analysée" />
            {photo.grid && (
              <span
                className="photo-grid"
                style={{
                  left: `${(photo.grid.x / photo.w) * 100}%`,
                  top: `${(photo.grid.y / photo.h) * 100}%`,
                  width: `${((photo.grid.size * 8) / photo.w) * 100}%`,
                  height: `${((photo.grid.size * 8) / photo.h) * 100}%`,
                }}
              />
            )}
          </div>
        )}
        {status && (
          <p className="small" role="status">
            {status}
          </p>
        )}

        <div className="palette" role="radiogroup" aria-label="Pièce à placer">
          {PALETTE.map((p) => (
            <button type="button" role="radio" aria-checked={tool === p} key={p} className={`palette-btn ${tool === p ? 'active' : ''}`} onClick={() => setTool(p)} aria-label={pieceName(p.toLowerCase(), p === p.toUpperCase() ? 'w' : 'b')}>
              <img src={PIECE_URL[(p === p.toUpperCase() ? 'w' : 'b') + p.toLowerCase()]} alt="" />
            </button>
          ))}
          <button type="button" role="radio" aria-checked={tool === 'x'} className={`palette-btn ${tool === 'x' ? 'active' : ''}`} onClick={() => setTool('x')} aria-label="Gomme">
            <Icon name="trash" />
          </button>
        </div>

        <fieldset className="radio-row">
          <legend>Trait</legend>
          {(['w', 'b'] as const).map((c) => (
            <label key={c} className={`chip ${turn === c ? 'active' : ''}`}>
              <input type="radio" name="turn" checked={turn === c} onChange={() => setTurn(c)} />
              {c === 'w' ? 'Aux blancs' : 'Aux noirs'}
            </label>
          ))}
        </fieldset>

        <div className="import-actions">
          <button type="button" className="ghost" onClick={() => setSquares(toSquares(START))}>
            Position de départ
          </button>
          <button type="button" className="ghost" onClick={() => setSquares(toSquares('8/8/8/8/8/8/8/8'))}>
            Vider
          </button>
          <button type="button" className="ghost" onClick={() => setFlipped(!flipped)}>
            <Icon name="flip" /> Retourner
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => setSquares([...squares].reverse().map((r) => [...r].reverse()))}
            title="Si les blancs et les noirs ont été inversés à la lecture"
          >
            Inverser les camps
          </button>
        </div>

        <label className="fen-field">
          <span className="muted small">FEN</span>
          <input className="text-input" value={fen} readOnly onFocus={(e) => e.target.select()} />
        </label>
        {errorText && <p className="small error-text">{errorText}</p>}

        <div className="import-actions">
          <button type="button" className="primary" disabled={!valid} onClick={() => onAnalyze(fen)}>
            Analyser cette position
          </button>
          <button type="button" className="ghost" disabled={!valid} onClick={() => setPlaying(true)}>
            Jouer contre le moteur
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
