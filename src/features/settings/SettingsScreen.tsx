import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { THEMES } from '../../themes/themes';
import { applyTheme, useSettings, type Notation } from './settings';

export function SettingsScreen() {
  const s = useSettings();
  return (
    <div className="settings">
      <section className="settings-card">
        <h2>Thème</h2>
        <div className="theme-gallery" role="radiogroup" aria-label="Thème visuel">
          {THEMES.map((t) => (
            <button
              type="button"
              key={t.id}
              role="radio"
              aria-checked={s.theme === t.id}
              className={`theme-tile ${s.theme === t.id ? 'active' : ''}`}
              onClick={() => {
                s.set({ theme: t.id });
                applyTheme(t.id);
              }}
            >
              <ThemePreview t={t.preview} />
              <span className="theme-name">{t.name}</span>
              <span className="muted small">{t.mood}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>Revue</h2>
        <fieldset className="radio-row">
          <legend>Niveau par défaut</legend>
          {(Object.keys(REVIEW_LEVELS) as ReviewLevel[]).map((l) => (
            <label key={l} className={`chip ${s.level === l ? 'active' : ''}`}>
              <input type="radio" name="level" checked={s.level === l} onChange={() => s.set({ level: l })} />
              {REVIEW_LEVELS[l].label} <span className="muted small">profondeur {REVIEW_LEVELS[l].depth}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="radio-row">
          <legend>Notation des coups</legend>
          {(
            [
              ['fr', 'Française (R D T F C)'],
              ['en', 'Anglaise (K Q R B N)'],
              ['figurine', 'Figurines (♔ ♕ ♖ ♗ ♘)'],
            ] as [Notation, string][]
          ).map(([id, label]) => (
            <label key={id} className={`chip ${s.notation === id ? 'active' : ''}`}>
              <input type="radio" name="notation" checked={s.notation === id} onChange={() => s.set({ notation: id })} />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="toggle">
          <input type="checkbox" checked={s.coordinates} onChange={(e) => s.set({ coordinates: e.target.checked })} />
          Afficher les coordonnées
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.animations} onChange={(e) => s.set({ animations: e.target.checked })} />
          Animations (respecte aussi le réglage « Réduire les animations » de l'iPad)
        </label>
      </section>
    </div>
  );
}

function ThemePreview({ t }: { t: { bg: string; surface: string; light: string; dark: string; accent: string } }) {
  return (
    <svg viewBox="0 0 120 72" className="theme-preview" aria-hidden="true">
      <rect width="120" height="72" rx="8" fill={t.bg} />
      {Array.from({ length: 16 }, (_, i) => {
        const x = i % 4;
        const y = Math.floor(i / 4);
        return <rect key={i} x={8 + x * 14} y={8 + y * 14} width="14" height="14" fill={(x + y) % 2 ? t.dark : t.light} />;
      })}
      <rect x="72" y="8" width="40" height="56" rx="5" fill={t.surface} />
      <rect x="78" y="16" width="28" height="5" rx="2.5" fill={t.accent} />
      <rect x="78" y="27" width="22" height="4" rx="2" fill={t.dark} opacity="0.5" />
      <rect x="78" y="36" width="26" height="4" rx="2" fill={t.dark} opacity="0.5" />
      <rect x="78" y="45" width="18" height="4" rx="2" fill={t.dark} opacity="0.5" />
    </svg>
  );
}
