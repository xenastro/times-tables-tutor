import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ClipKey } from '../engine/arabicSpeech';
import type { Expr } from '../engine/guide';
import { currentLanguage, t, tIn } from '../i18n';
import { speak, stopSpeaking as stopVoice, useCanSpeak, type SpeechLang } from '../speech';
import { playArabic, stopArabic } from './arabicVoice';

/**
 * Read-aloud. English uses the phone's own voice; Arabic uses the recorded clips that ship with
 * the app (and is otherwise silent, never a guess by the phone). Sound is the child's choice,
 * made on this phone with the 🔊 button: they may be somewhere they can't turn the volume up.
 */

interface ReadAloudCtx {
  /** The child has sound on. */
  soundOn: boolean;
  setSoundOn(on: boolean): void;
  /** Sound is on and something can be heard in the screen's language. */
  active: boolean;
  /** Says `text`; on Arabic screens plays `clip` instead (and stays quiet without one). */
  say(text: string, onEnd?: () => void, clip?: ClipKey): void;
  /** Plays Arabic clips whatever the screen's language (bilingual mode), if sound is on. */
  sayArabic(clips: ClipKey[], onEnd?: () => void): void;
}

const Ctx = createContext<ReadAloudCtx>({
  soundOn: false,
  setSoundOn: () => undefined,
  active: false,
  say: (_t, onEnd) => onEnd?.(),
  sayArabic: (_c, onEnd) => onEnd?.(),
});

const KEY = (learnerId: string) => `sound:${learnerId}`;

function savedSound(learnerId: string): boolean | null {
  try {
    const v = localStorage.getItem(KEY(learnerId));
    return v === null ? null : v === 'on';
  } catch {
    return null;
  }
}

export function ReadAloudProvider({
  learnerId,
  defaultOn,
  lang,
  children,
}: {
  learnerId: string;
  /** Until the child chooses: on for younger learners. */
  defaultOn: boolean;
  lang: SpeechLang;
  children: ReactNode;
}) {
  const [choice, setChoice] = useState<boolean | null>(() => savedSound(learnerId));
  useEffect(() => setChoice(savedSound(learnerId)), [learnerId]);
  const soundOn = choice ?? defaultOn;

  const setSoundOn = useCallback(
    (on: boolean) => {
      setChoice(on);
      try {
        localStorage.setItem(KEY(learnerId), on ? 'on' : 'off');
      } catch {
        /* remembered for this visit only */
      }
      if (!on) stopSpeaking();
    },
    [learnerId],
  );

  const canSpeak = useCanSpeak('en');
  const active = soundOn && (lang === 'ar' || canSpeak);
  const say = useCallback(
    (text: string, onEnd?: () => void, clip?: ClipKey) => {
      if (!soundOn) return onEnd?.();
      if (lang === 'ar') return clip ? playArabic([clip], onEnd) : onEnd?.();
      if (!speak(text, 'en', onEnd)) onEnd?.();
    },
    [lang, soundOn],
  );
  const sayArabic = useCallback(
    (clips: ClipKey[], onEnd?: () => void) => {
      if (soundOn) playArabic(clips, onEnd);
      else onEnd?.();
    },
    [soundOn],
  );
  const value = useMemo(() => ({ soundOn, setSoundOn, active, say, sayArabic }), [soundOn, setSoundOn, active, say, sayArabic]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReadAloud(): ReadAloudCtx {
  return useContext(Ctx);
}

export function stopSpeaking() {
  stopVoice();
  stopArabic();
}

/** "7 times 8" — how a sum is said, so the voice doesn't have to guess what "×" means. */
export function spokenExpr(e: Expr): string {
  switch (e.op) {
    case 'times':
      return tIn(currentLanguage(), 'speech.times', { x: e.x, y: e.y });
    case 'plus':
      return tIn(currentLanguage(), 'speech.plus', { x: e.x, y: e.y });
    case 'minus':
      return tIn(currentLanguage(), 'speech.minus', { x: e.x, y: e.y });
    case 'half':
      return tIn(currentLanguage(), 'speech.half', { x: e.x });
    case 'gap':
      return tIn(currentLanguage(), e.pos === 'x' ? 'speech.gapX' : 'speech.gapY', { k: e.known, p: e.p });
  }
}

/** A practice question as it's read aloud. */
export function spokenQuestion(q: { a: number; b: number; form?: string; missing?: 'a' | 'b' }): string {
  if (q.form === 'missing') {
    return spokenExpr({ op: 'gap', pos: q.missing === 'a' ? 'x' : 'y', known: q.missing === 'a' ? q.b : q.a, p: q.a * q.b });
  }
  return spokenExpr({ op: 'times', x: q.a, y: q.b });
}

/** The speaker button: says it again. Hidden while sound is off. */
export function SayAgain({
  text,
  clip,
  arabic = false,
  className = 'icon-btn',
}: {
  text: string;
  clip?: ClipKey;
  /** Always the Arabic clip (bilingual mode), whatever the screen's language. */
  arabic?: boolean;
  className?: string;
}) {
  const { active, soundOn, say, sayArabic } = useReadAloud();
  if (arabic ? !soundOn || !clip : !active) return null;
  return (
    <button
      className={className}
      aria-label={t('speech.again')}
      title={t('speech.again')}
      onClick={() => (arabic && clip ? sayArabic([clip]) : say(text, undefined, clip))}
    >
      🔁
    </button>
  );
}

/** Sound on or off, the child's choice on this phone. */
export function SoundToggle({ className = 'icon-btn' }: { className?: string }) {
  const { soundOn, setSoundOn } = useReadAloud();
  return (
    <button
      className={className}
      aria-pressed={soundOn}
      aria-label={t(soundOn ? 'sound.turnOff' : 'sound.turnOn')}
      title={t(soundOn ? 'sound.turnOff' : 'sound.turnOn')}
      onClick={() => setSoundOn(!soundOn)}
    >
      {soundOn ? '🔊' : '🔇'}
    </button>
  );
}
