import { useEffect, useState } from 'react';
import type { TrickShow as Show } from '../engine/tricks';
import { t } from '../i18n';

/** Plays a token animation once, then offers "Watch again". */
export function TrickShow({ show }: { show: Show }) {
  const last = show.frames.length - 1;
  const [frame, setFrame] = useState(0);
  const [run, setRun] = useState(0);
  const finished = frame === last;

  useEffect(() => {
    if (finished) return;
    const id = window.setTimeout(() => setFrame((f) => f + 1), show.frames[frame].ms);
    return () => window.clearTimeout(id);
  }, [frame, finished, run, show]);

  const f = show.frames[frame];
  return (
    <div className="trick" role="img" aria-label={t(show.summary, show.summaryVars)}>
      <div
        className="trick-row"
        aria-hidden="true"
        style={
          {
            '--slots': show.slots,
            '--above': show.rowsAbove,
            '--below': show.rowsBelow,
          } as React.CSSProperties
        }
      >
        {show.tokens.map((tok) => {
          const s = f.tokens[tok.id];
          return (
            <span
              key={tok.id}
              className={`trick-token${s.lit ? ' lit' : ''}${tok.sym ? ' sym' : ''}`}
              style={
                {
                  '--x': s.x,
                  '--y': (s.y ?? 0) - (s.lit ? 0.08 : 0),
                  '--s': s.hidden ? 0.2 : s.lit ? 1.12 : 1,
                  opacity: s.hidden ? 0 : 1,
                } as React.CSSProperties
              }
            >
              {tok.text}
            </span>
          );
        })}
      </div>
      <p className="trick-caption" aria-live="polite">
        {f.caption ? t(f.caption, f.captionVars) : ' '}
      </p>
      <button
        className="btn btn-soft"
        style={{ visibility: finished ? 'visible' : 'hidden' }}
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
