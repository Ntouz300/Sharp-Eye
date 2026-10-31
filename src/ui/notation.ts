import type { Notation } from '../features/settings/settings';

const FR: Record<string, string> = { K: 'R', Q: 'D', R: 'T', B: 'F', N: 'C' };
const FIG: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘' };

/** Affiche un coup SAN dans la notation choisie (française R D T F C, anglaise, ou figurines). */
export function displaySan(san: string, notation: Notation): string {
  if (notation === 'en') return san;
  const map = notation === 'fr' ? FR : FIG;
  return san.replace(/^[KQRBN]/, (p) => map[p]).replace(/=([QRBN])/, (_m, p: string) => '=' + map[p]);
}

const PIECE_NAMES: Record<string, string> = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' };
export function pieceName(type: string, color: 'w' | 'b'): string {
  const n = PIECE_NAMES[type];
  const adj = color === 'w' ? (type === 'q' || type === 'r' ? 'blanche' : 'blanc') : type === 'q' || type === 'r' ? 'noire' : 'noir';
  return `${n} ${adj}`;
}

export function formatClock(seconds: number | undefined): string {
  if (seconds === undefined) return '';
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  if (s < 20) return `${m}:${String(sec).padStart(2, '0')},${Math.floor((s * 10) % 10)}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
