import { create } from 'zustand';
import { importPgn } from '../../pgn/parser';
import { db } from '../../storage/db';
import { saveGames } from '../../storage/games';
import { useSettings } from '../settings/settings';

/**
 * Compte chess.com relié. chess.com n'offre pas de connexion OAuth pour ce besoin : « relier » un compte
 * veut dire retenir un pseudo public, vérifié auprès de l'API publique. Aucun mot de passe.
 */
export interface ChessComProfile {
  username: string;
  name?: string;
  avatar?: string;
  country?: string;
  ratings: Partial<Record<'rapid' | 'blitz' | 'bullet' | 'daily', number>>;
}

export interface ChessComAccount extends ChessComProfile {
  linkedAt: number;
  lastSync?: number;
  /** Mois déjà lus en entier (URL d'archive) : un mois passé ne change plus. */
  doneMonths: string[];
}

export type FetchFn = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

const API = 'https://api.chess.com/pub/player';
const KEY = 'chesscom';

export class AccountNotFound extends Error {
  constructor() {
    super('Compte introuvable.');
    this.name = 'AccountNotFound';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('Hors ligne : la synchronisation reprendra à la prochaine connexion.');
    this.name = 'OfflineError';
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Requête en série avec réessais (429 ou erreur réseau), attente croissante. */
export async function getJson<T>(url: string, fetchFn: FetchFn = fetch, sleep: (ms: number) => Promise<unknown> = wait, tries = 4): Promise<T> {
  let delay = 1000;
  for (let attempt = 1; ; attempt++) {
    let res: Awaited<ReturnType<FetchFn>> | null = null;
    try {
      res = await fetchFn(url);
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError();
      if (attempt >= tries) throw new OfflineError();
    }
    if (res) {
      if (res.status === 404) throw new AccountNotFound();
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) throw new Error(`chess.com a répondu ${res.status}.`);
      if (attempt >= tries) throw new Error('chess.com est occupé. Réessaie dans un instant.');
    }
    await sleep(delay);
    delay *= 2;
  }
}

interface PlayerJson {
  username: string;
  name?: string;
  avatar?: string;
  country?: string;
}
type StatsJson = Partial<Record<'chess_rapid' | 'chess_blitz' | 'chess_bullet' | 'chess_daily', { last?: { rating: number } }>>;

export async function fetchProfile(username: string, fetchFn?: FetchFn, sleep?: (ms: number) => Promise<unknown>): Promise<ChessComProfile> {
  const user = encodeURIComponent(username.trim().toLowerCase());
  if (!user) throw new AccountNotFound();
  const p = await getJson<PlayerJson>(`${API}/${user}`, fetchFn, sleep);
  let stats: StatsJson = {};
  try {
    stats = await getJson<StatsJson>(`${API}/${user}/stats`, fetchFn, sleep);
  } catch (e) {
    if (e instanceof OfflineError) throw e;
  }
  const r = (k: keyof StatsJson) => stats[k]?.last?.rating;
  return {
    username: p.username ?? username.trim(),
    name: p.name,
    avatar: p.avatar,
    country: p.country?.split('/').pop(),
    ratings: { rapid: r('chess_rapid'), blitz: r('chess_blitz'), bullet: r('chess_bullet'), daily: r('chess_daily') },
  };
}

export async function getAccount(): Promise<ChessComAccount | undefined> {
  return (await db.kv.get(KEY))?.value as ChessComAccount | undefined;
}

/** Relie le compte : il devient aussi « mon pseudo » pour les puzzles, les progrès et l'orientation. */
export async function linkAccount(profile: ChessComProfile): Promise<ChessComAccount> {
  const account: ChessComAccount = { ...profile, linkedAt: Date.now(), doneMonths: [] };
  await db.kv.put({ key: KEY, value: account });
  const s = useSettings.getState();
  if (!s.usernames.some((u) => u.toLowerCase() === profile.username.toLowerCase())) s.set({ usernames: [...s.usernames, profile.username] });
  return account;
}

/** Délie le compte ; les parties importées restent, sauf si `deleteGames`. */
export async function unlinkAccount(deleteGames: boolean) {
  const acc = await getAccount();
  await db.kv.delete(KEY);
  if (acc) {
    const s = useSettings.getState();
    s.set({ usernames: s.usernames.filter((u) => u.toLowerCase() !== acc.username.toLowerCase()) });
  }
  if (deleteGames) {
    const ids = (await db.games.filter((g) => g.origin === 'chesscom').primaryKeys()) as string[];
    await db.transaction('rw', db.games, db.analyses, async () => {
      await db.games.bulkDelete(ids);
      await db.analyses.where('gameId').anyOf(ids).delete();
    });
  }
}

interface ChessComGame {
  url: string;
  uuid?: string;
  pgn?: string;
  rules?: string;
  end_time?: number;
}

export interface SyncProgress {
  month: string;
  monthIndex: number;
  months: number;
  added: number;
}

export interface SyncResult {
  added: number;
  duplicates: number;
  skipped: number;
  monthsRead: number;
}

const monthOf = (url: string) => url.split('/').slice(-2).join('-');
const currentMonth = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

/**
 * Importe toutes les parties du compte, du mois le plus récent au plus ancien. Les mois passés déjà lus
 * en entier ne sont plus relus. Aucune analyse n'est lancée : elle commence à l'ouverture d'une partie.
 */
export async function syncChessCom(
  account: ChessComAccount,
  opts: { fetchFn?: FetchFn; sleep?: (ms: number) => Promise<unknown>; now?: Date; onProgress?: (p: SyncProgress) => void; signal?: AbortSignal } = {},
): Promise<SyncResult> {
  const user = encodeURIComponent(account.username.toLowerCase());
  const { archives } = await getJson<{ archives: string[] }>(`${API}/${user}/games/archives`, opts.fetchFn, opts.sleep);
  const now = currentMonth(opts.now ?? new Date());
  const done = new Set(account.doneMonths);
  const todo = [...archives].reverse().filter((u) => !done.has(u));
  const result: SyncResult = { added: 0, duplicates: 0, skipped: 0, monthsRead: 0 };
  for (const [i, url] of todo.entries()) {
    if (opts.signal?.aborted) break;
    opts.onProgress?.({ month: monthOf(url), monthIndex: i, months: todo.length, added: result.added });
    const { games } = await getJson<{ games: ChessComGame[] }>(url, opts.fetchFn, opts.sleep);
    const parsed = [];
    const meta: ChessComGame[] = [];
    for (const g of games) {
      if (!g.pgn) continue;
      const { games: pg } = importPgn(g.pgn);
      if (!pg[0]) {
        result.skipped++;
        continue;
      }
      if (!pg[0].headers.Link) pg[0].headers.Link = g.url;
      parsed.push(pg[0]);
      meta.push(g);
    }
    const r = await saveGames(parsed, {
      origin: 'chesscom',
      importedAt: (_, k) => (meta[k].end_time ? meta[k].end_time! * 1000 : undefined),
      unanalyzable: (_, k) => (meta[k].rules ?? 'chess') !== 'chess',
    });
    result.added += r.added.length;
    result.duplicates += r.duplicates;
    result.monthsRead++;
    if (monthOf(url) < now) done.add(url);
    await db.kv.put({ key: KEY, value: { ...account, doneMonths: [...done], lastSync: Date.now() } satisfies ChessComAccount });
  }
  await db.kv.put({ key: KEY, value: { ...((await getAccount()) ?? account), doneMonths: [...done], lastSync: Date.now() } });
  return result;
}

// ---------- État de la synchro dans l'interface ----------

interface SyncState {
  running: boolean;
  progress: SyncProgress | null;
  message: string | null;
  sync: () => Promise<void>;
}

export const useSync = create<SyncState>((set, get) => ({
  running: false,
  progress: null,
  message: null,
  sync: async () => {
    if (get().running) return;
    const acc = await getAccount();
    if (!acc) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      set({ message: 'Hors ligne : synchronisation à la prochaine connexion.' });
      return;
    }
    set({ running: true, progress: null, message: null });
    try {
      const r = await syncChessCom(acc, { onProgress: (progress) => set({ progress }) });
      set({ message: r.added ? `${r.added} nouvelle${r.added > 1 ? 's' : ''} partie${r.added > 1 ? 's' : ''} importée${r.added > 1 ? 's' : ''}.` : 'Bibliothèque à jour.' });
    } catch (e) {
      set({ message: (e as Error).message });
    } finally {
      set({ running: false, progress: null });
    }
  },
}));
