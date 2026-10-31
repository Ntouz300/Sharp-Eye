import { create } from 'zustand';
import { analyzeGame, type GameAnalysis } from '../../analysis/analyzeGame';
import type { ReviewLevel } from '../../analysis/config';
import { getEngine } from '../../engine/stockfish';
import { parseGame } from '../../pgn/parser';
import type { ParsedGame } from '../../pgn/types';
import { db, evalCache, type StoredGame } from '../../storage/db';
import { useSettings } from '../settings/settings';
import { restoreAnalysis } from '../../analysis/pgnExport';

export type View = 'library' | 'review' | 'settings' | 'help';

interface ReviewState {
  view: View;
  stored: StoredGame | null;
  game: ParsedGame | null;
  analysis: GameAnalysis | null;
  progress: { done: number; total: number } | null;
  error: string | null;
  /** Demi-coup affiché : 0 = position initiale, n = après le n-ième coup. */
  ply: number;
  flipped: boolean;
  autoplay: boolean;
  /** Filtre des boutons « Erreur suivante / précédente ». */
  errorFilter: 'all' | 'w' | 'b';
  setView: (v: View) => void;
  openGame: (stored: StoredGame) => Promise<void>;
  analyze: (level: ReviewLevel) => Promise<void>;
  cancel: () => void;
  goTo: (ply: number) => void;
  step: (delta: number) => void;
  flip: () => void;
  setAutoplay: (on: boolean) => void;
  setErrorFilter: (f: 'all' | 'w' | 'b') => void;
}

let controller: AbortController | null = null;

export const useReview = create<ReviewState>((set, get) => ({
  view: 'library',
  stored: null,
  game: null,
  analysis: null,
  progress: null,
  error: null,
  ply: 0,
  flipped: false,
  autoplay: false,
  errorFilter: 'all',

  setView: (view) => set({ view }),

  openGame: async (stored) => {
    get().cancel();
    let game: ParsedGame;
    try {
      game = parseGame(stored.source);
    } catch (e) {
      set({ error: `Impossible de relire cette partie : ${(e as Error).message}` });
      return;
    }
    set({ view: 'review', stored, game, analysis: null, progress: null, error: null, ply: 0, autoplay: false });
    // Reprend la meilleure revue déjà enregistrée, sinon lance la revue au niveau choisi.
    const saved = await db.analyses.where('gameId').equals(stored.id).toArray();
    const done = saved.find((a) => a.analysis.complete);
    if (done) {
      set({ analysis: done.analysis });
      return;
    }
    // PGN exporté par Sharp Eye : la revue est reconstruite sans relancer le moteur.
    const restored = restoreAnalysis(game);
    if (restored) {
      set({ analysis: restored.analysis });
      await db.analyses.put({ key: `${stored.id}|${restored.analysis.level}`, gameId: stored.id, analysis: restored.analysis });
      await db.games.update(stored.id, {
        accuracyWhite: restored.analysis.white.accuracy ?? undefined,
        accuracyBlack: restored.analysis.black.accuracy ?? undefined,
        analyzedLevel: restored.analysis.level,
      });
      return;
    }
    void get().analyze(useSettings.getState().level);
  },

  analyze: async (level) => {
    const { game, stored } = get();
    if (!game || !stored) return;
    get().cancel();
    const ctrl = new AbortController();
    controller = ctrl;
    const total = game.moves.length + 1;
    set({ progress: { done: 0, total }, error: null });
    try {
      const analysis = await analyzeGame(game, {
        level,
        engine: getEngine(),
        cache: evalCache,
        signal: ctrl.signal,
        onProgress: (partial, done) => {
          if (controller === ctrl) set({ analysis: partial, progress: { done, total } });
        },
      });
      if (controller !== ctrl) return;
      set({ analysis, progress: null });
      await db.analyses.put({ key: `${stored.id}|${level}`, gameId: stored.id, analysis });
      await db.games.update(stored.id, {
        accuracyWhite: analysis.white.accuracy ?? undefined,
        accuracyBlack: analysis.black.accuracy ?? undefined,
        analyzedLevel: level,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      set({ error: `L'analyse a échoué : ${(e as Error).message}`, progress: null });
    } finally {
      if (controller === ctrl) controller = null;
    }
  },

  cancel: () => {
    if (controller) {
      controller.abort();
      controller = null;
      set({ progress: null });
    }
  },

  goTo: (ply) => {
    const n = get().game?.moves.length ?? 0;
    set({ ply: Math.max(0, Math.min(n, ply)) });
  },
  step: (delta) => get().goTo(get().ply + delta),
  flip: () => set({ flipped: !get().flipped }),
  setAutoplay: (autoplay) => set({ autoplay }),
  setErrorFilter: (errorFilter) => set({ errorFilter }),
}));
