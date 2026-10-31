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
  {
    id: 'foret',
    name: 'Forêt',
    mood: 'Verts profonds, accents dorés',
    dark: true,
    preview: { bg: '#13201a', surface: '#1b2b22', light: '#E6E9C8', dark: '#6F8F4E', accent: '#d8b25a' },
  },
  {
    id: 'marbre',
    name: 'Marbre',
    mood: 'Marbre blanc et noir veiné',
    dark: false,
    preview: { bg: '#f3f2ef', surface: '#ffffff', light: '#F2F0EC', dark: '#8C8A86', accent: '#3d3b38' },
  },
  {
    id: 'ocean',
    name: 'Océan',
    mood: 'Turquoise et sable',
    dark: false,
    preview: { bg: '#eef6f7', surface: '#fbfefe', light: '#E8F1F2', dark: '#4F8FA0', accent: '#0f6e83' },
  },
  {
    id: 'couchant',
    name: 'Coucher de soleil',
    mood: 'Dégradés orangés et pourpres',
    dark: true,
    preview: { bg: '#2a1622', surface: '#36202c', light: '#F7DCC0', dark: '#C0646A', accent: '#f59e5b' },
  },
  {
    id: 'neon',
    name: 'Néon',
    mood: 'Cyberpunk, contours lumineux',
    dark: true,
    preview: { bg: '#07070f', surface: '#11121f', light: '#2B2F48', dark: '#1A1D30', accent: '#ff3bd8' },
  },
  {
    id: 'washi',
    name: 'Papier japonais',
    mood: 'Washi, encre noire, rouge vermillon',
    dark: false,
    preview: { bg: '#f4eee1', surface: '#fbf8f0', light: '#F4EEE1', dark: '#A99E8A', accent: '#b8322a' },
  },
  {
    id: 'retro',
    name: 'Rétro 8 bits',
    mood: 'Pixel art et chiptune',
    dark: true,
    preview: { bg: '#0f1a0b', surface: '#1a2a12', light: '#C4CFA1', dark: '#6B8F3A', accent: '#c4cfa1' },
  },
  {
    id: 'glace',
    name: 'Glace',
    mood: 'Blancs bleutés, verre dépoli',
    dark: false,
    preview: { bg: '#e8f2fa', surface: '#f8fbfe', light: '#EAF4FB', dark: '#9DBAD3', accent: '#2f6f9f' },
  },
  {
    id: 'contraste',
    name: 'Contraste élevé',
    mood: 'Accessibilité maximale',
    dark: true,
    preview: { bg: '#000000', surface: '#000000', light: '#FFFFFF', dark: '#5A5A5A', accent: '#ffd400' },
  },
];

export const DEFAULT_THEME = 'tournoi';
