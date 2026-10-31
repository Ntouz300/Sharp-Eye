import { create } from 'zustand';
import { analyzeGame } from '../../analysis/analyzeGame';
import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { getEngine } from '../../engine/stockfish';
import { parseGame } from '../../pgn/parser';
import { db, evalCache, type StoredGame } from '../../storage/db';
import { syncPuzzles } from '../puzzles/puzzles';
import { useSettings } from '../settings/settings';

/** Temps moyen par position (ms) mesuré sur l'appareil, par niveau ; valeurs de départ prudentes. */
const SPEED_KEY = 'sharp-eye:ms-per-position';
const DEFAULT_MS: Record<ReviewLevel, number> = { quick: 200, standard: 500, deep: 2000 };

export function msPerPosition(level: ReviewLevel): number {
  try {
    const v = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}')[level];
    if (typeof v === 'number' && v > 0) return v;
  } catch {
    /* stockage indisponible */
  }
  return DEFAULT_MS[level];
}

function recordSpeed(level: ReviewLevel, ms: number) {
  try {
    const all = JSON.parse(localStorage.getItem(SPEED_KEY) ?? '{}');
    all[level] = all[level] ? all[level] * 0.7 + ms * 0.3 : ms;
    localStorage.setItem(SPEED_KEY, JSON.stringify(all));
  } catch {
    /* stockage indisponible */
  }
}

/** Durée estimée (ms) pour analyser des parties à un niveau. */
export function estimateMs(games: Pick<StoredGame, 'plies'>[], level: ReviewLevel): number {
  return games.reduce((a, g) => a + (g.plies + 1) * msPerPosition(level), 0);
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return `environ ${min} min`;
  const h = Math.floor(min / 60);
  return `environ ${h} h ${String(min % 60).padStart(2, '0')}`;
}

interface BatchState {
  queue: string[];
  total: number;
  done: number;
  level: ReviewLevel;
  running: boolean;
  /** Mise en pause par l'utilisateur, ou le temps qu'une partie ouverte soit analysée. */
  paused: boolean;
  pausedForReview: boolean;
  current: string | null;
  start: (ids: string[], level: ReviewLevel) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  pauseForReview: () => void;
  resumeAfterReview: () => void;
}

let ctrl: AbortController | null = null;
let wakeLock: { release: () => Promise<void> } | null = null;

async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) wakeLock = await (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
    if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    /* Wake Lock refusé : l'analyse continue tant que l'écran reste allumé */
  }
}

/**
 * File d'analyse groupée : une partie à la fois, les plus récentes d'abord. Jamais lancée sans un toucher
 * de l'utilisateur ; ouvrir une partie met la file en pause le temps de la revue.
 */
export const useBatch = create<BatchState>((set, get) => {
  const loop = async () => {
    if (get().running) return;
    set({ running: true });
    void keepAwake(true);
    while (get().queue.length && !get().paused) {
      const [id, ...rest] = get().queue;
      const g = await db.games.get(id);
      set({ current: id });
      if (g && !g.unanalyzable && g.analyzedLevel === undefined) {
        const level = get().level;
        ctrl = new AbortController();
        const t0 = performance.now();
        try {
          const parsed = parseGame(g.source);
          const analysis = await analyzeGame(parsed, { level, engine: getEngine(), cache: evalCache, signal: ctrl.signal });
          recordSpeed(level, (performance.now() - t0) / (parsed.moves.length + 1));
          await db.analyses.put({ key: `${g.id}|${level}`, gameId: g.id, analysis });
          await syncPuzzles(g.id, parsed, analysis, useSettings.getState().usernames);
          await db.games.update(g.id, { accuracyWhite: analysis.white.accuracy ?? undefined, accuracyBlack: analysis.black.accuracy ?? undefined, analyzedLevel: level });
        } catch (e) {
          // Pause ou annulation : la partie reste en tête de file.
          if ((e as Error).name === 'AbortError') break;
        } finally {
          ctrl = null;
        }
      }
      set({ queue: rest, done: get().done + 1 });
    }
    set({ running: false, current: null });
    if (!get().queue.length) set({ total: 0, done: 0, paused: false });
    void keepAwake(false);
  };

  return {
    queue: [],
    total: 0,
    done: 0,
    level: useSettings.getState().level,
    running: false,
    paused: false,
    pausedForReview: false,
    current: null,
    start: (ids, level) => {
      set({ queue: ids, total: ids.length, done: 0, level, paused: false });
      useSettings.getState().set({ batchLevel: level });
      void loop();
    },
    pause: () => {
      set({ paused: true });
      ctrl?.abort();
    },
    resume: () => {
      set({ paused: false, pausedForReview: false });
      void loop();
    },
    cancel: () => {
      set({ queue: [], total: 0, done: 0, paused: false });
      ctrl?.abort();
    },
    pauseForReview: () => {
      if (!get().queue.length || get().paused) return;
      set({ paused: true, pausedForReview: true });
      ctrl?.abort();
    },
    resumeAfterReview: () => {
      if (get().pausedForReview) get().resume();
    },
  };
});

export const LEVELS = Object.keys(REVIEW_LEVELS) as ReviewLevel[];
