import { useCallback, useEffect, useState } from 'react';
import { arabicClips } from '../engine/arabic';
import { api } from '../data/api';
import { db } from '../data/db';
import type { AudioClipDTO } from '../shared/api';
import { speak, stopSpeaking, useCanSpeak } from '../speech';

/**
 * Arabic speech for bilingual mode. Prefers the parent's own recorded clips (kept on the phone
 * for offline use), then the phone's Arabic voice, and otherwise stays silent (the words are
 * always on screen too).
 */

const KEY = (clip: string) => `audio:${clip}`;
const CHANGED = 'app:clips-changed';

interface StoredClip {
  updatedAt: number;
  blob: Blob;
}

/** Brings the phone's copy of the parent's clips up to date. Safe to call often. */
export async function syncClips(token: string): Promise<void> {
  const { clips } = await api<{ clips: AudioClipDTO[] }>('GET', '/device/audio', undefined, token);
  const wanted = new Map(clips.map((c) => [c.clip, c.updatedAt]));
  const stored = await db.kv.where('key').startsWith('audio:').toArray();
  let changed = false;
  for (const row of stored) {
    const clip = row.key.slice('audio:'.length);
    if (!wanted.has(clip)) {
      await db.kv.delete(row.key);
      changed = true;
    }
  }
  const have = new Map(stored.map((r) => [r.key, (r.value as StoredClip).updatedAt]));
  for (const [clip, updatedAt] of wanted) {
    if (have.get(KEY(clip)) === updatedAt) continue;
    const res = await fetch(`/api/device/audio/${clip}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    await db.kv.put({ key: KEY(clip), value: { updatedAt, blob: await res.blob() } satisfies StoredClip });
    changed = true;
  }
  if (changed) window.dispatchEvent(new Event(CHANGED));
}

async function storedClipNames(): Promise<Set<string>> {
  try {
    const keys = await db.kv.where('key').startsWith('audio:').primaryKeys();
    return new Set(keys.map((k) => String(k).slice('audio:'.length)));
  } catch {
    return new Set();
  }
}

let current: HTMLAudioElement | null = null;
let cancelled = { value: false };

function stopClips() {
  cancelled.value = true;
  current?.pause();
  current = null;
}

/** Plays the clips one after another, then calls `onEnd`. */
async function playClips(clips: string[], onEnd?: () => void) {
  stopClips();
  const token = { value: false };
  cancelled = token;
  for (const clip of clips) {
    const row = await db.kv.get(KEY(clip));
    if (token.value || !row) break;
    const url = URL.createObjectURL((row.value as StoredClip).blob);
    try {
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!token.value) onEnd?.();
}

export function stopArabic() {
  stopClips();
  stopSpeaking();
}

export interface ArabicVoice {
  /** Something can be heard: a full set of recordings, or the phone's Arabic voice. */
  available: boolean;
  /** Says `text`, using the recorded `clips` when the parent has recorded all of them. */
  say(clips: string[], text: string, onEnd?: () => void): void;
}

export function useArabicVoice(): ArabicVoice {
  const canTts = useCanSpeak('ar');
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    const load = () => void storedClipNames().then((s) => live && setRecorded(s));
    load();
    window.addEventListener(CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, load);
    };
  }, []);

  const say = useCallback(
    (clips: string[], text: string, onEnd?: () => void) => {
      // Check the phone's copy at the moment of speaking: the first question of a session
      // comes before the list above has loaded.
      void storedClipNames().then((have) => {
        if (clips.length && clips.every((c) => have.has(c))) void playClips(clips, onEnd);
        else if (!canTts || !speak(text, 'ar', onEnd)) onEnd?.();
      });
    },
    [canTts],
  );
  return { available: canTts || recorded.size > 0, say };
}

/** Clips for "a ضرب b". */
export function questionClips(a: number, b: number): string[] {
  return [...arabicClips(a), 'times', ...arabicClips(b)];
}
