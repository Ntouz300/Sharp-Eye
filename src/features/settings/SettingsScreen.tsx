import { useRef, useState } from 'react';
import { REVIEW_LEVELS, type ReviewLevel } from '../../analysis/config';
import { exportBackup, importBackup } from '../../storage/backup';
import { shareOrDownload } from '../../ui/share';
import { THEMES } from '../../themes/themes';
import { applyTheme, SIZES, useSettings, type Notation, type Size } from './settings';

export function SettingsScreen() {
  const s = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
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
        <h2>Mes pseudos</h2>
        <p className="muted small">Sépare-les par des virgules. Ils servent à reconnaître tes parties pour les statistiques, les puzzles et le répertoire.</p>
        <input
          id="usernames"
          className="text-input"
          type="text"
          defaultValue={s.usernames.join(', ')}
          onBlur={(e) => s.set({ usernames: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
          placeholder="ex. antoine_echecs, antoine-lichess"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
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
        <SizeRow legend="Taille des flèches de navigation" name="navSize" value={s.navSize} onChange={(v) => s.set({ navSize: v })} />
        <SizeRow legend="Taille du graphique d’évaluation" name="graphSize" value={s.graphSize} onChange={(v) => s.set({ graphSize: v })} />
        <label className="toggle">
          <input type="checkbox" checked={s.coordinates} onChange={(e) => s.set({ coordinates: e.target.checked })} />
          Afficher les coordonnées
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.animations} onChange={(e) => s.set({ animations: e.target.checked })} />
          Animations (respecte aussi le réglage « Réduire les animations » de l'iPad)
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.board3d} onChange={(e) => s.set({ board3d: e.target.checked })} />
          Échiquier en perspective 3D pendant la revue
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.narration} onChange={(e) => s.set({ narration: e.target.checked })} />
          Narration : lire les coups et les explications à voix haute
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.sayMove} onChange={(e) => s.set({ sayMove: e.target.checked })} />
          Lire aussi le coup joué (sinon, seulement son classement et la raison)
        </label>
      </section>
      <section className="settings-card">
        <h2>Sauvegarde</h2>
        <p className="muted small">Toutes tes données restent sur cet appareil. Sauvegarde-les dans un fichier (iCloud Drive, Fichiers) pour les retrouver sur un autre appareil.</p>
        <div className="import-actions">
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              const { set: _ignore, ...settings } = useSettings.getState();
              const blob = await exportBackup(settings);
              const r = await shareOrDownload(blob, `sharp-eye-${new Date().toISOString().slice(0, 10)}.json`, 'Sauvegarde Sharp Eye');
              setBackupMsg(r === 'cancelled' ? null : 'Sauvegarde créée.');
            }}
          >
            Sauvegarder mes données
          </button>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
            Restaurer une sauvegarde
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await importBackup(await f.text());
                if (r.settings) s.set(r.settings as Partial<typeof s>);
                setBackupMsg(`Restauré : ${r.games} parties, ${r.analyses} analyses, ${r.puzzles} puzzles.`);
              } catch (err) {
                setBackupMsg((err as Error).message);
              }
            }}
          />
        </div>
        {backupMsg && <p className="small" role="status">{backupMsg}</p>}
      </section>
    </div>
  );
}

function SizeRow({ legend, name, value, onChange }: { legend: string; name: string; value: Size; onChange: (v: Size) => void }) {
  return (
    <fieldset className="radio-row">
      <legend>{legend}</legend>
      {SIZES.map((z) => (
        <label key={z.id} className={`chip ${value === z.id ? 'active' : ''}`}>
          <input type="radio" name={name} checked={value === z.id} onChange={() => onChange(z.id)} />
          {z.label}
        </label>
      ))}
    </fieldset>
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
