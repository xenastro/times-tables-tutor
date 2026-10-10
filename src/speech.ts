import { useEffect, useState } from 'react';

/**
 * Read-aloud with the browser's built-in voices (speechSynthesis). No network, no service.
 * If the browser has no speech support, or no voice for the language, everything here quietly
 * does nothing and `useCanSpeak` reports false, so the app can hide its speaker button.
 */

export type SpeechLang = 'en' | 'ar';

/** Calm, a little slower than normal speech. */
const RATE = 0.85;

let voices: SpeechSynthesisVoice[] = [];
const listeners = new Set<() => void>();

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

function loadVoices() {
  try {
    voices = synth()?.getVoices() ?? [];
  } catch {
    voices = [];
  }
  for (const l of listeners) l();
}

let started = false;
function start() {
  if (started) return;
  started = true;
  const s = synth();
  if (!s) return;
  loadVoices();
  // Chrome loads its voice list asynchronously.
  try {
    s.addEventListener('voiceschanged', loadVoices);
  } catch {
    /* very old browsers */
  }
}

export function voiceFor(lang: SpeechLang): SpeechSynthesisVoice | null {
  start();
  const matching = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  // Prefer a voice that works offline.
  return matching.find((v) => v.localService) ?? matching[0] ?? null;
}

export function canSpeak(lang: SpeechLang): boolean {
  return !!synth() && !!voiceFor(lang);
}

/** Speaks `text`, replacing anything already being said. Returns false if it couldn't. */
export function speak(text: string, lang: SpeechLang = 'en', onEnd?: () => void): boolean {
  const s = synth();
  const voice = voiceFor(lang);
  if (!s || !voice || !text.trim()) return false;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = RATE;
    if (onEnd) {
      u.onend = () => onEnd();
      u.onerror = () => onEnd();
    }
    s.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  try {
    synth()?.cancel();
  } catch {
    /* nothing to stop */
  }
}

/** Whether there is a voice for `lang`; updates when the browser finishes loading its voices. */
export function useCanSpeak(lang: SpeechLang): boolean {
  const [ok, setOk] = useState(() => canSpeak(lang));
  useEffect(() => {
    const update = () => setOk(canSpeak(lang));
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, [lang]);
  return ok;
}
