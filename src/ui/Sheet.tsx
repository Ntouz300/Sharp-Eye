import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Feuille glissante : monte du bas sur téléphone et en portrait, se pose à droite en paysage large.
 * Elle se ferme par le bouton, la touche Échap ou un toucher sur le voile.
 */
export function Sheet({ title, onClose, children, side = 'auto', className = '' }: { title: string; onClose: () => void; children: ReactNode; side?: 'auto' | 'bottom'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className={`sheet-layer sheet-${side}`}>
      <div className="sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn subtle" onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: string;
  /** Valeur affichée à droite (réglage courant). */
  value?: string;
  checked?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

/** Menu « … » : liste d'actions rares, présentée comme une feuille. */
export function MenuSheet({ title, groups, onClose }: { title: string; groups: MenuItem[][]; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose} side="bottom" className="menu-sheet">
      {groups.map((items, g) => (
        <ul className="menu-group" key={g} role="menu">
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                aria-checked={it.checked}
                className="menu-item"
                disabled={it.disabled}
                onClick={() => {
                  it.onSelect();
                  if (it.checked === undefined && it.value === undefined) onClose();
                }}
              >
                {it.icon && <Icon name={it.icon} />}
                <span className="menu-label">{it.label}</span>
                {it.value && <span className="menu-value">{it.value}</span>}
                {it.checked !== undefined && <span className={`switch ${it.checked ? 'on' : ''}`} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      ))}
    </Sheet>
  );
}
