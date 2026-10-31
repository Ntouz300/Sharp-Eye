import { create } from 'zustand';
import { analyzeGame, buildAnalysis, type GameAnalysis } from '../../analysis/analyzeGame';
import { EXPLAIN_VERSION } from '../../analysis/explain';
import { REVIEW_LEVELS } from '../../analysis/config';
import type { ReviewLevel } from '../../analysis/config';
import { getEngine } from '../../engine/stockfish';
import { parseGame } from '../../pgn/parser';
import type { ParsedGame } from '../../pgn/types';
import { db, evalCache, type StoredGame } from '../../storage/db';
import { useSettings } from '../settings/settings';
import { restoreAnalysis } from '../../analysis/pgnExport';
import { syncPuzzles } from '../puzzles/puzzles';
import { useBatch } from '../library/batch';

/** Les quatre destinations de la barre d'onglets. La revue s'ouvre par-dessus. */
export type Tab = 'games' | 'training' | 'progress' | 'profile';
/** Les trois temps de la revue : aperçu de la partie, coup par coup (avec la feuille Approfondir). */
export type Stage = 'overview' | 'moves';
export type TrainingMode = 'guess' | 'play' | null;

interface ReviewState {
  tab: Tab;
  reviewOpen: boolean;
  stage: Stage;
  trainingMode: TrainingMode;
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
  /** Thème de puzzles choisi depuis le profil des faiblesses. */
  puzzleTheme?: string;
  setTab: (t: Tab, puzzleTheme?: string) => void;
  setStage: (s: Stage) => void;
  setTrainingMode: (m: TrainingMode) => void;
  openGame: (stored: StoredGame, opts?: { stage?: Stage; ply?: number; mode?: TrainingMode }) => Promise<void>;
  /** Ferme la revue : l'analyse en cours est mise en pause (les positions calculées restent en cache). */
  closeReview: () => void;
  analyze: (level: ReviewLevel) => Promise<void>;
  cancel: () => void;
  /** Coup réanalysé seul à profondeur 24 (« Analyser plus profondément »). */
  deepening: number | null;
  deepen: (ply: number) => Promise<void>;
  goTo: (ply: number) => void;
  step: (delta: number) => void;
  flip: () => void;
  setAutoplay: (on: boolean) => void;
  setErrorFilter: (f: 'all' | 'w' | 'b') => void;
}

let controller: AbortController | null = null;
export const DEEP_DEPTH = 24;

export const useReview = create<ReviewState>((set, get) => ({
  tab: 'games',
  reviewOpen: false,
  stage: 'overview',
  trainingMode: null,
  stored: null,
  game: null,
  analysis: null,
  progress: null,
  error: null,
  ply: 0,
  flipped: false,
  autoplay: false,
  errorFilter: 'all',
  deepening: null,

  setTab: (tab, puzzleTheme) => set({ tab, puzzleTheme, reviewOpen: false }),
  setStage: (stage) => set({ stage }),
  setTrainingMode: (trainingMode) => set({ trainingMode }),

  closeReview: () => {
    get().cancel();
    useBatch.getState().resumeAfterReview();
    set({ reviewOpen: false, autoplay: false, trainingMode: null });
  },

  openGame: async (stored, opts = {}) => {
    get().cancel();
    useBatch.getState().pauseForReview();
    let game: ParsedGame;
    try {
      game = parseGame(stored.source);
    } catch (e) {
      set({ error: `Impossible de relire cette partie : ${(e as Error).message}` });
      return;
    }
    // L'échiquier se place du côté de l'utilisateur s'il a les noirs.
    const me = useSettings.getState().usernames.map((u) => u.toLowerCase());
    const flipped = me.includes(stored.black.toLowerCase()) && !me.includes(stored.white.toLowerCase());
    set({
      reviewOpen: true,
      stored,
      game,
      analysis: null,
      progress: null,
      error: null,
      ply: opts.ply ?? 0,
      autoplay: false,
      flipped,
      stage: opts.stage ?? 'moves',
      trainingMode: opts.mode ?? null,
    });
    if (!stored.opened) void db.games.update(stored.id, { opened: true });
    // Reprend la meilleure revue déjà enregistrée, sinon lance la revue au niveau choisi.
    const saved = await db.analyses.where('gameId').equals(stored.id).toArray();
    const done = saved.find((a) => a.analysis.complete);
    if (done) {
      let analysis = done.analysis;
      // Revue enregistrée avec d'anciennes règles d'explication : reconstruite depuis ses évaluations, sans moteur.
      if (analysis.explainVersion !== EXPLAIN_VERSION && analysis.evals?.length) {
        analysis = buildAnalysis(game, analysis.evals, analysis.level, analysis.engine);
        void db.analyses.put({ ...done, analysis });
      }
      set({ analysis, stage: opts.stage ?? (opts.ply ? 'moves' : 'overview') });
      return;
    }
    if (stored.unanalyzable) {
      set({ error: 'Variante non standard : la partie s’affiche, mais le moteur ne peut pas l’analyser.' });
      return;
    }
    // PGN exporté par Sharp Eye : la revue est reconstruite sans relancer le moteur.
    const restored = restoreAnalysis(game);
    if (restored) {
      set({ analysis: restored.analysis });
      await syncPuzzles(stored.id, game, restored.analysis, useSettings.getState().usernames);
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
      await syncPuzzles(stored.id, game, analysis, useSettings.getState().usernames);
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

  deepen: async (ply) => {
    const { game, stored, analysis } = get();
    if (!game || !stored || !analysis?.evals || ply < 1 || analysis.evals.length <= ply) return;
    get().cancel();
    set({ deepening: ply });
    try {
      const multiPv = Math.max(2, REVIEW_LEVELS[analysis.level].multiPv);
      const evals = [...analysis.evals];
      for (const i of [ply - 1, ply]) {
        if (!evals[i].lines.length) continue;
        const t0 = performance.now();
        const ev = await getEngine().analyze(evals[i].fen, DEEP_DEPTH, multiPv);
        evals[i] = { ...ev, timeMs: Math.round(performance.now() - t0) };
      }
      const next = buildAnalysis(game, evals, analysis.level, analysis.engine);
      if (get().stored?.id !== stored.id) return;
      set({ analysis: next });
      await db.analyses.put({ key: `${stored.id}|${analysis.level}`, gameId: stored.id, analysis: next });
    } catch (e) {
      set({ error: `Analyse approfondie impossible : ${(e as Error).message}` });
    } finally {
      set({ deepening: null });
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
