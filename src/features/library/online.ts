/** Récupération des parties depuis les API publiques de chess.com et de Lichess. */

export type Site = 'chesscom' | 'lichess';

export interface OnlineGame {
  id: string;
  pgn: string;
  white: string;
  black: string;
  whiteRating?: number;
  blackRating?: number;
  result: string;
  /** Cadence lisible (« Blitz 3+2 »). */
  speed: string;
  date: Date;
  url?: string;
}

const SPEED_FR: Record<string, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapide',
  daily: 'Par correspondance',
  correspondence: 'Par correspondance',
  classical: 'Classique',
  ultraBullet: 'Ultra-bullet',
};

function formatTc(tc: string | undefined): string {
  if (!tc) return '';
  const m = /^(\d+)(?:\+(\d+))?$/.exec(tc);
  if (!m) return '';
  const base = Number(m[1]);
  const min = base >= 60 ? `${base / 60}` : `${base}s`;
  return ` ${min}+${m[2] ?? 0}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (res.status === 404) throw new Error('Pseudo introuvable.');
  if (!res.ok) throw new Error(`Le site a répondu ${res.status}. Réessaie dans un instant.`);
  return res.json() as Promise<T>;
}

interface ChessComGame {
  url: string;
  pgn?: string;
  time_control: string;
  time_class: string;
  end_time: number;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

function chessComResult(g: ChessComGame): string {
  if (g.white.result === 'win') return '1-0';
  if (g.black.result === 'win') return '0-1';
  return '1/2-1/2';
}

/** Parties d'un mois sur chess.com (`monthIndex` 0 = mois le plus récent disponible). */
export async function chessComGames(username: string, monthIndex = 0, signal?: AbortSignal): Promise<{ games: OnlineGame[]; month: string; hasOlder: boolean }> {
  const user = encodeURIComponent(username.trim().toLowerCase());
  const { archives } = await getJson<{ archives: string[] }>(`https://api.chess.com/pub/player/${user}/games/archives`, signal);
  if (!archives.length) return { games: [], month: '', hasOlder: false };
  const url = archives[archives.length - 1 - monthIndex];
  const { games } = await getJson<{ games: ChessComGame[] }>(url, signal);
  const [year, month] = url.split('/').slice(-2);
  return {
    month: new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    hasOlder: archives.length - 1 - monthIndex > 0,
    games: games
      .filter((g) => g.pgn)
      .map((g) => ({
        id: g.url,
        pgn: g.pgn!,
        url: g.url,
        white: g.white.username,
        black: g.black.username,
        whiteRating: g.white.rating,
        blackRating: g.black.rating,
        result: chessComResult(g),
        speed: (SPEED_FR[g.time_class] ?? g.time_class) + formatTc(g.time_control),
        date: new Date(g.end_time * 1000),
      }))
      .reverse(),
  };
}

interface LichessGame {
  id: string;
  speed: string;
  createdAt: number;
  winner?: 'white' | 'black';
  status: string;
  clock?: { initial: number; increment: number };
  players: { white: { user?: { name: string }; rating?: number; aiLevel?: number }; black: { user?: { name: string }; rating?: number; aiLevel?: number } };
  pgn: string;
}

const lichessName = (p: LichessGame['players']['white']) => p.user?.name ?? (p.aiLevel ? `Stockfish niveau ${p.aiLevel}` : 'Anonyme');

/** 50 dernières parties d'un joueur Lichess. */
export async function lichessGames(username: string, signal?: AbortSignal): Promise<OnlineGame[]> {
  const user = encodeURIComponent(username.trim());
  const res = await fetch(`https://lichess.org/api/games/user/${user}?max=50&clocks=true&opening=true&pgnInJson=true`, {
    headers: { Accept: 'application/x-ndjson' },
    signal,
  });
  if (res.status === 404) throw new Error('Pseudo introuvable.');
  if (!res.ok) throw new Error(`Lichess a répondu ${res.status}. Réessaie dans un instant.`);
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LichessGame)
    .map((g) => ({
      id: g.id,
      pgn: g.pgn,
      url: `https://lichess.org/${g.id}`,
      white: lichessName(g.players.white),
      black: lichessName(g.players.black),
      whiteRating: g.players.white.rating,
      blackRating: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : g.status === 'started' ? '*' : '1/2-1/2',
      speed: (SPEED_FR[g.speed] ?? g.speed) + (g.clock ? formatTc(`${g.clock.initial}+${g.clock.increment}`) : ''),
      date: new Date(g.createdAt),
    }));
}

/** Reconnaît un lien de partie. Lichess : PGN récupéré directement. chess.com : pas d'API par identifiant. */
export function parseGameLink(text: string): { site: Site; id: string } | null {
  const t = text.trim();
  const li = /^https?:\/\/(?:www\.)?lichess\.org\/(?:game\/export\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:\/(?:white|black))?(?:[#?].*)?$/.exec(t);
  if (li) return { site: 'lichess', id: li[1] };
  const cc = /^https?:\/\/(?:www\.)?chess\.com\/(?:[a-z]{2}\/)?(?:game\/)?(?:live|daily|analysis\/game\/live)\/(?:game\/)?(\d+)/.exec(t);
  if (cc) return { site: 'chesscom', id: cc[1] };
  return null;
}

export async function lichessGamePgn(id: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`https://lichess.org/game/export/${id}?clocks=true&evals=false`, { headers: { Accept: 'application/x-chess-pgn' }, signal });
  if (!res.ok) throw new Error(res.status === 404 ? 'Partie introuvable sur Lichess.' : `Lichess a répondu ${res.status}.`);
  return res.text();
}
