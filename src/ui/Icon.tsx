const PATHS: Record<string, string> = {
  first: 'M6 5v14 M18 6l-8 6 8 6z',
  prev: 'M15 6l-6 6 6 6',
  next: 'M9 6l6 6-6 6',
  last: 'M18 5v14 M6 6l8 6-8 6z',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8 5.5v13 M16 5.5v13',
  flip: 'M7 4v13 M4 14l3 3 3-3 M17 20V7 M14 10l3-3 3 3',
  library: 'M4 5h4v14H4z M10 5h4v14h-4z M16.2 5.6l3.8-1 3 13.6-3.8 1z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
  board: 'M4 4h16v16H4z M4 12h16 M12 4v16',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.2a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.8 M12 17.2v.3',
  upload: 'M12 15V4 M7.5 8.5 12 4l4.5 4.5 M4 15v4h16v-4',
  trash: 'M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13',
  star: 'M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5 20 20',
  close: 'M6 6l12 12 M18 6 6 18',
  puzzle: 'M5 9V5h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H5v-4a2 2 0 1 0 0-4z',
  book: 'M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z M12 6.5v13',
  chart: 'M4 20h16 M7 16v-5 M12 16V7 M17 16v-8',
  download: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M4 15v4h16v-4',
  expand: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z M16 9.5l5 5 M21 9.5l-5 5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M8.5 20h7 M10 17h4v3h-4z',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3.5v4 M16 3.5v4',
  more: 'M5.5 12h.01 M12 12h.01 M18.5 12h.01',
  back: 'M15 5l-7 7 7 7',
  games: 'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h4',
  training: 'M12 3l2.4 5 5.6.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.6 8z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20a7.5 7.5 0 0 1 15 0',
  layers: 'M12 4l8 4-8 4-8-4z M4 12l8 4 8-4 M4 16l8 4 8-4',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  plus: 'M12 5v14 M5 12h14',
  sync: 'M19 12a7 7 0 0 1-12.3 4.6 M5 12a7 7 0 0 1 12.3-4.6 M17.5 3.5v4h-4 M6.5 20.5v-4h4',
  'next-error': 'M5 6l6 6-6 6 M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 6l6 6-6 6',
};

/** Icônes d'interface dessinées pour l'application (traits 24 × 24). */
export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  const fill = name === 'play' ? 'currentColor' : 'none';
  const thick = name === 'more';
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} fill={fill} stroke="currentColor" strokeWidth={thick ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
