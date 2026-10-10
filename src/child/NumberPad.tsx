import { useRef } from 'react';
import { n, t } from '../i18n';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'enter'];

export function NumberPad({
  onPress,
  disabled,
  canSubmit,
  compact,
}: {
  onPress: (key: string) => void;
  disabled: boolean;
  canSubmit: boolean;
  /** Shorter keys, to leave room for a guide above. */
  compact?: boolean;
}) {
  // Set when a touch's pointerdown has already pressed the key, so the click that follows it is skipped.
  // The click's own pointerType can't tell us: iOS Safari 18.2+ reports a tap's click as "mouse"
  // (WebKit bug 282988), and older iOS ignores preventDefault() on pointerdown, so taps typed twice.
  const touched = useRef(false);
  return (
    <div className={`numpad${compact ? ' compact' : ''}`} role="group" aria-label={t('common.numberPad')} dir="ltr">
      {KEYS.map((k) => (
        <button
          key={k}
          className={k === 'enter' ? 'enter' : undefined}
          disabled={disabled || (k === 'enter' && !canSubmit)}
          aria-label={k === 'back' ? t('common.delete') : k === 'enter' ? t('common.check') : k}
          // pointerdown feels instant on phones; click covers the mouse and keyboard activation.
          onPointerDown={(e) => {
            touched.current = e.pointerType !== 'mouse';
            if (touched.current) {
              e.preventDefault();
              onPress(k);
            }
          }}
          onClick={() => {
            if (touched.current) touched.current = false;
            else onPress(k);
          }}
        >
          {k === 'back' ? '⌫' : k === 'enter' ? '✓' : n(k)}
        </button>
      ))}
    </div>
  );
}
