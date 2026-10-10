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
  return (
    <div className={`numpad${compact ? ' compact' : ''}`} role="group" aria-label={t('common.numberPad')} dir="ltr">
      {KEYS.map((k) => (
        <button
          key={k}
          className={k === 'enter' ? 'enter' : undefined}
          disabled={disabled || (k === 'enter' && !canSubmit)}
          aria-label={k === 'back' ? t('common.delete') : k === 'enter' ? t('common.check') : k}
          // pointerdown feels instant on phones; click covers keyboard activation.
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') {
              e.preventDefault();
              onPress(k);
            }
          }}
          onClick={(e) => {
            if ((e.nativeEvent as PointerEvent).pointerType === 'mouse' || e.detail === 0) onPress(k);
          }}
        >
          {k === 'back' ? '⌫' : k === 'enter' ? '✓' : n(k)}
        </button>
      ))}
    </div>
  );
}
