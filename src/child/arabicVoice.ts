import { allClips, bilingualClips, VOICE, type ClipKey } from '../engine/arabicSpeech';

/**
 * Arabic speech: recorded clips that ship with the app (public/voice/ar/), so every phone says
 * the same correct Fus-ha whether or not it has an Arabic voice of its own. The service worker
 * keeps each clip once fetched, and `prefetchArabic` fetches the ones a learner needs ahead of
 * time so they also work offline.
 */

const BASE = `/voice/ar/${VOICE.dir}/`;
const url = (key: ClipKey) => `${BASE}${key}.mp3`;

let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    // iPhones mute web audio with the ring switch unless the page asks to play like media.
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Phones only allow sound after a tap: wake the audio up on the first one.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = audioContext();
    if (c && c.state !== 'running') void c.resume().catch(() => undefined);
  };
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
}

/** A few decoded clips, so "say it again" is instant. */
const decoded = new Map<ClipKey, AudioBuffer>();
const KEEP = 24;

async function load(c: AudioContext, key: ClipKey): Promise<AudioBuffer | null> {
  const hit = decoded.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(url(key));
    if (!res.ok) return null;
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    decoded.set(key, buf);
    if (decoded.size > KEEP) decoded.delete(decoded.keys().next().value!);
    return buf;
  } catch {
    return null;
  }
}

let current: AudioBufferSourceNode | null = null;
let turn = 0;

export function stopArabic() {
  turn++;
  try {
    current?.stop();
  } catch {
    /* already stopped */
  }
  current = null;
}

/** Plays the clips one after another, then calls `onEnd` (also when nothing could be played). */
export function playArabic(keys: ClipKey[], onEnd?: () => void) {
  stopArabic();
  const mine = ++turn;
  window.dispatchEvent(new CustomEvent('app:arabic-say', { detail: keys }));
  const c = audioContext();
  if (!c) return onEnd?.();
  void (async () => {
    // Before the first tap the phone may refuse; don't wait for it.
    if (c.state !== 'running') await Promise.race([c.resume().catch(() => undefined), new Promise((r) => setTimeout(r, 300))]);
    for (const key of keys) {
      const buf = await load(c, key);
      if (mine !== turn) return;
      if (!buf || c.state !== 'running') break;
      await new Promise<void>((resolve) => {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.onended = () => resolve();
        current = src;
        src.start();
      });
      if (mine !== turn) return;
    }
    current = null;
    onEnd?.();
  })();
}

let prefetched = '';

/** Fetches the clips a learner will need (once per set), so they play offline and without delay. */
export function prefetchArabic(all: boolean) {
  const which = all ? 'all' : 'bilingual';
  if (prefetched === which || prefetched === 'all') return;
  prefetched = which;
  const keys = all ? allClips() : bilingualClips();
  void (async () => {
    // A few at a time, in the background.
    for (let i = 0; i < keys.length; i += 6) {
      await Promise.all(keys.slice(i, i + 6).map((k) => fetch(url(k)).catch(() => undefined)));
    }
  })();
}
