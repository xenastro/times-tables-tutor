import type { TrickShow as Show } from '../engine/tricks';
import { n, t } from '../i18n';
import { PLAYBACK_SLOWDOWN, PlaybackButton, usePlayback } from './Playback';

/** Plays a token animation once (the child can pause it to read), then offers "Watch again". */
export function TrickShow({ show }: { show: Show }) {
  const playback = usePlayback(show.frames.length - 1, (i) => show.frames[i].ms * PLAYBACK_SLOWDOWN);
  const f = show.frames[playback.frame];
  return (
    <div className="trick" role="img" aria-label={t(show.summary, show.summaryVars)}>
      <div
        className="trick-row"
        aria-hidden="true"
        dir="ltr"
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
              {n(tok.text)}
            </span>
          );
        })}
      </div>
      <p className="trick-caption" aria-live="polite">
        {f.caption ? t(f.caption, f.captionVars) : ' '}
      </p>
      <PlaybackButton playback={playback} />
    </div>
  );
}
