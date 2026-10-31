import { create } from 'zustand';
import type { ReviewLevel } from '../../analysis/config';
import { DEFAULT_THEME, THEMES } from '../../themes/themes';

export type Notation = 'fr' | 'en' | 'figurine';

export interface Settings {
  theme: string;
  notation: Notation;
  level: ReviewLevel;
  coordinates: boolean;
  animations: boolean;
}

const KEY = 'sharp-eye:settings';
const DEFAULTS: Settings = { theme: DEFAULT_THEME, notation: 'fr', level: 'standard', coordinates: true, animations: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
    if (!THEMES.some((t) => t.id === s.theme)) s.theme = DEFAULT_THEME;
    return s;
  } catch {
    return DEFAULTS;
  }
}

export const useSettings = create<Settings & { set: (patch: Partial<Settings>) => void }>((setState, get) => ({
  ...load(),
  set: (patch) => {
    setState(patch);
    const { set: _omit, ...rest } = { ...get() };
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* navigation privée : réglage gardé pour la session */
    }
  },
}));

/** Applique le thème au document, avec un fondu de 200 ms. */
export function applyTheme(id: string) {
  const root = document.documentElement;
  root.classList.add('theme-fade');
  root.dataset.theme = id;
  const meta = document.querySelector('meta[name="theme-color"]');
  const t = THEMES.find((x) => x.id === id);
  if (meta && t) meta.setAttribute('content', t.preview.bg);
  window.setTimeout(() => root.classList.remove('theme-fade'), 220);
}
