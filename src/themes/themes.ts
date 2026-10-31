/**
 * Thèmes visuels. Chaque thème est un jeu complet de variables CSS (design tokens) défini dans themes.css
 * sous [data-theme="<id>"]. Pour ajouter un thème : un bloc dans themes.css et une entrée ici.
 */
export interface ThemeInfo {
  id: string;
  name: string;
  mood: string;
  dark: boolean;
  /** Couleurs pour la miniature de la galerie. */
  preview: { bg: string; surface: string; light: string; dark: string; accent: string };
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'tournoi',
    name: 'Tournoi classique',
    mood: 'Bois et parchemin, sobre',
    dark: false,
    preview: { bg: '#F6F0E2', surface: '#FFFBF2', light: '#EEDDBB', dark: '#B58863', accent: '#8A4B1E' },
  },
  {
    id: 'minuit',
    name: 'Minuit',
    mood: 'Bleu nuit, accent cyan',
    dark: true,
    preview: { bg: '#0E1726', surface: '#16233A', light: '#9FB4C7', dark: '#3E5468', accent: '#4FD1E8' },
  },
  {
    id: 'ardoise',
    name: 'Ardoise',
    mood: 'Gris neutre, très lisible',
    dark: true,
    preview: { bg: '#1E2226', surface: '#282D33', light: '#D9DDE1', dark: '#7D8794', accent: '#9CC3FF' },
  },
];

export const DEFAULT_THEME = 'tournoi';
