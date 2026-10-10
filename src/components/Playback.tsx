import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

/** Frame timings are designed at 1×; children follow better at half speed. Keep in step with the CSS transitions. */
export const PLAYBACK_SLOWDOWN = 2;

export interface Playback {
  frame: number;
  finished: boolean;
  paused: boolean;
  pause: () => void;
  play: () => void;
  replay: () => void;
}

/**
 * Steps through frames 0..last, holding each for `msFor(frame)`. Pausing freezes the current
 * frame so the child can read it for as long as they need; playing picks up where it stopped.
 */
export function usePlayback(last: number, msFor: (frame: number) => number): Playback {
  const [frame, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  // When the current frame is due to end, and how much of it was left when paused.
  const timer = useRef<{ due: number; left: number | null }>({ due: 0, left: null });
  const finished = frame >= last;

  useEffect(() => {
    if (finished || paused) return;
    const ms = timer.current.left ?? msFor(frame);
    timer.current = { due: Date.now() + ms, left: null };
    const id = window.setTimeout(() => setFrame((f) => f + 1), ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, finished, paused, run]);

  return {
    frame,
    finished,
    paused,
    pause: () => {
      timer.current.left = Math.max(0, timer.current.due - Date.now());
      setPaused(true);
    },
    play: () => setPaused(false),
    replay: () => {
      timer.current.left = null;
      setFrame(0);
      setPaused(false);
      setRun((r) => r + 1);
    },
  };
}

/** One button for the whole short: Pause while it plays, Play while paused, Watch again at the end. */
export function PlaybackButton({ playback: p }: { playback: Playback }) {
  if (p.finished) {
    return (
      <button className="btn btn-soft playback-btn" onClick={p.replay}>
        ↻ {t('trick.again')}
      </button>
    );
  }
  return p.paused ? (
    <button className="btn btn-soft playback-btn" onClick={p.play}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className="playback-icon">
        <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />
      </svg>
      {t('trick.play')}
    </button>
  ) : (
    <button className="btn btn-soft playback-btn" onClick={p.pause}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
        <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
      </svg>
      {t('trick.pause')}
    </button>
  );
}
