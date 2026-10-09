import { useEffect, type ReactNode } from 'react';
import { t } from '../i18n';

/** Bottom sheet; closes on backdrop tap or Escape. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
        <button className="btn" onClick={onClose}>
          {t('map.close')}
        </button>
      </div>
    </div>
  );
}
