import { useEffect, useState } from 'react';
import { t } from '../i18n';

/**
 * "Turn it around": a rows of b blocks rotate a quarter turn into b rows of a.
 * Same blocks, same answer, which is why 3 × 7 and 7 × 3 are one fact.
 */

const FRAMES = [
  { ms: 3200, turned: false, caption: 'turnaround.rows', eq: 'first' },
  { ms: 3000, turned: true, caption: 'turnaround.turn', eq: 'none' },
  { ms: 3200, turned: true, caption: 'turnaround.rows', eq: 'second' },
  { ms: 0, turned: true, caption: 'turnaround.same', eq: 'both' },
] as const;

export function TurnaroundShow({ a, b }: { a: number; b: number }) {
  const [frame, setFrame] = useState(0);
  const [run, setRun] = useState(0);
  const last = FRAMES.length - 1;
  const f = FRAMES[frame];

  useEffect(() => {
    if (frame === last) return;
    const id = window.setTimeout(() => setFrame((i) => i + 1), FRAMES[frame].ms);
    return () => window.clearTimeout(id);
  }, [frame, last, run]);

  const p = a * b;
  const big = Math.max(a, b);
  const step = Math.min(26, Math.floor(230 / big));
  const box = big * step;
  // Before turning: a rows of b. After: b rows of a.
  const rows = f.turned ? b : a;
  const each = f.turned ? a : b;
  const eq =
    f.eq === 'first' ? `${a} × ${b} = ${p}` : f.eq === 'second' ? `${b} × ${a} = ${p}` : f.eq === 'both' ? `${a} × ${b} = ${b} × ${a} = ${p}` : ' ';

  return (
    <div className="turnaround" role="img" aria-label={t('turnaround.summary', { a, b, p })}>
      <div className="turnaround-stage" style={{ width: box, height: box }} aria-hidden="true">
        <div
          className={`turnaround-grid${f.turned ? ' turned' : ''}`}
          style={{
            gridTemplateColumns: `repeat(${b}, ${step - 3}px)`,
            gridAutoRows: `${step - 3}px`,
          }}
        >
          {Array.from({ length: p }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
      <p className="turnaround-caption" aria-live="polite">
        {t(f.caption, { rows, each })}
      </p>
      <p className="turnaround-eq num">{eq}</p>
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

/** For fact details: a button that plays the turnaround short. */
export function TurnaroundToggle({ a, b }: { a: number; b: number }) {
  const [open, setOpen] = useState(false);
  if (a === b) return null;
  return open ? (
    <TurnaroundShow a={a} b={b} />
  ) : (
    <button className="btn btn-soft" onClick={() => setOpen(true)}>
      ↻ {t('turnaround.button')}: {a} × {b} = {b} × {a}
    </button>
  );
}
