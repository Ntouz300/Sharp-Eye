import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Feuille glissante : monte du bas sur téléphone et en portrait, se pose à droite en paysage large.
 * Elle se ferme par le bouton, la touche Échap ou un toucher sur le voile.
 */
export function Sheet({ title, onClose, children, side = 'auto', className = '', style }: { title: string; onClose: () => void; children: ReactNode; side?: 'auto' | 'bottom' | 'popover'; className?: string; style?: CSSProperties }) {
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
      <div className={`sheet ${className}`} style={style} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
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

let anchor: DOMRect | null = null;

/** Retient le bouton qui ouvre un menu, pour l'ancrer à côté sur iPad en paysage. */
export function rememberAnchor(el: Element) {
  anchor = el.getBoundingClientRect();
}

/** Position du menu : panneau ancré sous le bouton en paysage large, feuille du bas sinon. */
function popoverPlacement(): { side: 'bottom' | 'popover'; style?: CSSProperties } {
  const a = anchor;
  anchor = null;
  if (!a || !window.matchMedia('(min-width: 1000px) and (orientation: landscape)').matches) return { side: 'bottom' };
  const top = a.bottom + 8;
  return { side: 'popover', style: { top, right: Math.max(12, window.innerWidth - a.right), maxHeight: `min(85dvh, calc(100dvh - ${top + 16}px))` } };
}

/** Menu « … » : liste d'actions rares, en 3 colonnes fixes (icône, libellé, valeur ou interrupteur). */
export function MenuSheet({ title, groups, onClose }: { title: string; groups: MenuItem[][]; onClose: () => void }) {
  const place = useRef(popoverPlacement()).current;
  return (
    <Sheet title={title} onClose={onClose} side={place.side} style={place.style} className="menu-sheet">
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
                <span className="menu-icon">{it.icon && <Icon name={it.icon} />}</span>
                <span className="menu-label">{it.label}</span>
                <span className="menu-end">
                  {it.value && <span className="menu-value">{it.value}</span>}
                  {it.checked !== undefined && <span className={`switch ${it.checked ? 'on' : ''}`} aria-hidden="true" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </Sheet>
  );
}
