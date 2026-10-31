import { db, type StoredPuzzle } from '../../storage/db';
import { dayKey } from '../progress/achievements';
import { fromBank, fromStored, nextLevel, START_LEVEL, toStored, type BankEntry, type Challenge, type Level } from './challenge';
import { getProfile, playable, recordAttempt } from './puzzles';

/** Thèmes dans l'ordre d'affichage (tuiles « Défis par thème »). */
export const THEMES = ['Mats', 'Fourchettes', 'Clouages', 'Enfilades', 'Découvertes', 'Pièces en prise', 'Promotions', 'Finales', 'Tactique'];

let cache: Promise<Challenge[]> | null = null;
/** Banque intégrée, chargée à la demande (fichier séparé, hors ligne). */
export function loadBank(): Promise<Challenge[]> {
  cache ??= import('./bank.json').then((m) => (m.default as BankEntry[]).map(fromBank));
  return cache;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Défi du jour : stable pour la journée, un peu au-dessus de ton niveau, tiré de tes erreurs ou de la banque. */
export function dailyChallenge(all: Challenge[], level: Level, day = dayKey()): Challenge | undefined {
  if (!all.length) return undefined;
  const target = level.rating + 100;
  const pool = [...all].sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target) || a.id.localeCompare(b.id)).slice(0, 12);
  return pool[hash(day) % pool.length];
}

export async function getLevel(): Promise<Level> {
  return { ...START_LEVEL, ...((await db.kv.get('challengeLevel'))?.value as Level | undefined) };
}

export interface LogEntry {
  t: number;
  success: boolean;
  theme: string;
}

export async function getLog(): Promise<LogEntry[]> {
  return ((await db.kv.get('challengeLog'))?.value as LogEntry[] | undefined) ?? [];
}

/** Tous les défis jouables : ceux de tes parties (premier coup unique) et ceux de la banque. */
export function allChallenges(stored: StoredPuzzle[], bank: Challenge[]): Challenge[] {
  return [...stored.filter((p) => p.label !== 'bank' && playable(p)).map(fromStored), ...bank];
}

/**
 * Enregistre un défi terminé : révision espacée et classement (comme les anciens puzzles),
 * niveau adaptatif, journal de la semaine et défi du jour.
 */
export async function recordChallenge(ch: Challenge, success: boolean, opts: { daily?: boolean; now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const existing = (await db.puzzles.get(ch.id)) ?? toStored(ch, now);
  const r = await recordAttempt(existing, success, now);
  const level = nextLevel(await getLevel(), success);
  await db.kv.put({ key: 'challengeLevel', value: level });
  const log = [...(await getLog()), { t: now, success, theme: ch.theme }].slice(-500);
  await db.kv.put({ key: 'challengeLog', value: log });
  if (opts.daily) {
    const prev = (await db.kv.get('daily'))?.value as { count: number } | undefined;
    await db.kv.put({ key: 'daily', value: { day: dayKey(now), success, count: (prev?.count ?? 0) + (success ? 1 : 0) } });
  }
  return { ...r, level };
}

/** Début de la semaine (lundi 0 h). */
export function weekStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Thème le plus faible : le plus bas taux de réussite (3 essais au moins). */
export function weakestTheme(stored: StoredPuzzle[]): { theme: string; rate: number } | undefined {
  const m = new Map<string, { a: number; s: number }>();
  for (const p of stored) {
    const e = m.get(p.theme) ?? { a: 0, s: 0 };
    e.a += p.attempts;
    e.s += p.successes;
    m.set(p.theme, e);
  }
  return [...m.entries()]
    .filter(([, v]) => v.a >= 3)
    .map(([theme, v]) => ({ theme, rate: v.s / v.a }))
    .sort((a, b) => a.rate - b.rate)[0];
}

export { getProfile };
