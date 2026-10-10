import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Expr } from '../engine/guide';
import { t } from '../i18n';
import { speak, stopSpeaking, useCanSpeak, type SpeechLang } from '../speech';

interface ReadAloudCtx {
  /** On in settings *and* the phone has a voice for the language. */
  active: boolean;
  say(text: string, onEnd?: () => void): void;
}

const Ctx = createContext<ReadAloudCtx>({ active: false, say: () => undefined });

export function ReadAloudProvider({ enabled, lang, children }: { enabled: boolean; lang: SpeechLang; children: ReactNode }) {
  const canSpeak = useCanSpeak(lang);
  const active = enabled && canSpeak;
  const say = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!active || !speak(text, lang, onEnd)) onEnd?.();
    },
    [active, lang],
  );
  const value = useMemo(() => ({ active, say }), [active, say]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReadAloud(): ReadAloudCtx {
  return useContext(Ctx);
}

export { stopSpeaking };

/** "7 times 8" — how a sum is said, so the voice doesn't have to guess what "×" means. */
export function spokenExpr(e: Expr): string {
  switch (e.op) {
    case 'times':
      return t('speech.times', { x: e.x, y: e.y });
    case 'plus':
      return t('speech.plus', { x: e.x, y: e.y });
    case 'minus':
      return t('speech.minus', { x: e.x, y: e.y });
    case 'half':
      return t('speech.half', { x: e.x });
    case 'gap':
      return t(e.pos === 'x' ? 'speech.gapX' : 'speech.gapY', { k: e.known, p: e.p });
  }
}

/** A practice question as it's read aloud. */
export function spokenQuestion(q: { a: number; b: number; form?: string; missing?: 'a' | 'b' }): string {
  if (q.form === 'missing') {
    return spokenExpr({ op: 'gap', pos: q.missing === 'a' ? 'x' : 'y', known: q.missing === 'a' ? q.b : q.a, p: q.a * q.b });
  }
  return spokenExpr({ op: 'times', x: q.a, y: q.b });
}

/** The speaker button: says `text` again. Hidden when read-aloud isn't active. */
export function SayAgain({ text, className = 'icon-btn' }: { text: string; className?: string }) {
  const { active, say } = useReadAloud();
  if (!active) return null;
  return (
    <button className={className} aria-label={t('speech.again')} title={t('speech.again')} onClick={() => say(text)}>
      🔊
    </button>
  );
}
