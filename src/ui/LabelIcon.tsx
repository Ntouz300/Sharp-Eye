import { LABEL_INFO, type Label } from '../analysis/classify';

/** Couleurs des étiquettes (communes à tous les thèmes, contrastées sur fond clair et sombre). */
export const LABEL_COLOR: Record<Label, { bg: string; fg: string }> = {
  book: { bg: '#a5835e', fg: '#ffffff' },
  forced: { bg: '#7d838c', fg: '#ffffff' },
  brilliant: { bg: '#14a3a0', fg: '#ffffff' },
  great: { bg: '#3a78d4', fg: '#ffffff' },
  best: { bg: '#4fae2a', fg: '#ffffff' },
  excellent: { bg: '#5e9440', fg: '#ffffff' },
  good: { bg: '#9cc08f', fg: '#18301a' },
  inaccuracy: { bg: '#efc232', fg: '#3a2b00' },
  mistake: { bg: '#ec8a2a', fg: '#2e1700' },
  blunder: { bg: '#d33f3b', fg: '#ffffff' },
  miss: { bg: '#e0689a', fg: '#ffffff' },
};

/** Glyphe dessiné pour chaque étiquette, dans un carré de 20 × 20. */
function Glyph({ label, color }: { label: Label; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const text = (t: string, size = 9.5) => (
    <text x="10" y="10.4" textAnchor="middle" dominantBaseline="central" fontSize={size} fontWeight="800" fill={color} fontFamily="system-ui, sans-serif" letterSpacing="-0.6">
      {t}
    </text>
  );
  switch (label) {
    case 'book':
      return (
        <g {...stroke} strokeWidth={1.6}>
          <path d="M5 6.2c1.8-.8 3.6-.8 5 .4v8c-1.4-1.2-3.2-1.2-5-.4z M15 6.2c-1.8-.8-3.6-.8-5 .4v8c1.4-1.2 3.2-1.2 5-.4z" fill={color} fillOpacity={0.25} />
        </g>
      );
    case 'forced':
      return <path d="M5 10h9 M11 6.5 14.5 10 11 13.5" {...stroke} />;
    case 'brilliant':
      return text('!!');
    case 'great':
      return text('!', 11);
    case 'best':
      return <path d="M10 4.6l1.6 3.4 3.7.4-2.8 2.5.8 3.6L10 12.7l-3.3 1.8.8-3.6L4.7 8.4l3.7-.4z" fill={color} />;
    case 'excellent':
      return (
        <path
          d="M6 9.2h2v5.6H6z M8.6 9.2 10.4 5.4c.9 0 1.5.6 1.4 1.6l-.3 1.9h2.7c.8 0 1.3.7 1.1 1.4l-1.1 3.7c-.2.5-.6.8-1.1.8H8.6z"
          fill={color}
        />
      );
    case 'good':
      return <path d="M5.5 10.4 8.6 13.4 14.6 6.8" {...stroke} />;
    case 'inaccuracy':
      return text('?!', 9);
    case 'mistake':
      return text('?', 11);
    case 'blunder':
      return text('??', 9.5);
    case 'miss':
      return <path d="M6.5 6.5 13.5 13.5 M13.5 6.5 6.5 13.5" {...stroke} />;
  }
}

export function LabelIcon({ label, size = 18, title = true }: { label: Label; size?: number; title?: boolean }) {
  const c = LABEL_COLOR[label];
  return (
    <svg className="label-icon" width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={LABEL_INFO[label].name}>
      {title && <title>{LABEL_INFO[label].name}</title>}
      <circle cx="10" cy="10" r="9.5" fill={c.bg} />
      <Glyph label={label} color={c.fg} />
    </svg>
  );
}
