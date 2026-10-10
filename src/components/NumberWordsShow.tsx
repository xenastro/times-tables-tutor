import { useEffect, useMemo, useState } from 'react';
import { arabicClips, arabicParts, arabicWords } from '../engine/arabic';
import { n as num, t } from '../i18n';
import { PLAYBACK_SLOWDOWN } from './TrickShow';

/**
 * "56 is ستة وخمسون": the digits light up in the order Arabic says them (the ones first,
 * then the tens; hundreds come before both), and each word appears as its digit lights.
 */
export function NumberWordsShow({ n, say }: { n: number; say?: (clips: string[], text: string) => void }) {
  const parts = useMemo(() => arabicParts(n), [n]);
  const words = arabicWords(n);
  const digits = String(n).split('');
  // Frame 0: just the number. Frames 1..k: one more word each. Last frame: the whole reading.
  const last = parts.length + 1;
  const [frame, setFrame] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (frame === last) {
      say?.(arabicClips(n), words);
      return;
    }
    const ms = (frame === 0 ? 1200 : 1500) * PLAYBACK_SLOWDOWN;
    const id = window.setTimeout(() => setFrame((f) => f + 1), ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, last, run]);

  const shown = Math.min(frame, parts.length);
  const active = frame >= 1 && frame <= parts.length ? parts[frame - 1] : null;
  const caption =
    frame === 0
      ? t('words.intro')
      : active
        ? t(`words.place${digits.length - 1 - Math.min(...active.digits)}`, { w: active.text })
        : t('words.whole', { n, w: words });

  return (
    <div className="words-show" role="img" aria-label={t('words.summary', { n, w: words })}>
      <div className="words-digits num" dir="ltr" aria-hidden="true">
        {digits.map((d, i) => {
          const lit = active ? active.digits.includes(i) : frame === last;
          const said = parts.slice(0, shown).some((p) => p.digits.includes(i));
          return (
            <span key={i} className={`${lit ? 'lit' : ''}${said ? ' said' : ''}`}>
              {num(d)}
            </span>
          );
        })}
      </div>
      <p className="words-row" dir="rtl" lang="ar" aria-hidden="true">
        {parts.map((p, i) => (
          <span key={i} className={`${i < shown ? 'in' : ''}${active === p ? ' lit' : ''}`}>
            {p.text}
          </span>
        ))}
      </p>
      <p className="trick-caption" aria-live="polite">
        {caption}
      </p>
      <button
        className="btn btn-soft"
        style={{ visibility: frame === last ? 'visible' : 'hidden' }}
        onClick={() => {
          setFrame(0);
          setRun((r) => r + 1);
        }}
      >
        ↻ {t('trick.again')}
      </button>
    </div>
  );
}
