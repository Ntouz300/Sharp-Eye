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
  chart: 'M4 20h16 M7 16v-5 M12 16V7 M17 16v-8',
  download: 'M12 4v11 M7.5 10.5 12 15l4.5-4.5 M4 15v4h16v-4',
};

/** Icônes d'interface dessinées pour l'application (traits 24 × 24). */
export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  const fill = name === 'play' ? 'currentColor' : 'none';
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
