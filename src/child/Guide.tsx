import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarModel, exprText } from '../components/StrategyView';
import { guideFor } from '../engine/guide';
import { t } from '../i18n';
import { NumberPad } from './NumberPad';

export type GuideMode = 'new' | 'hint' | 'mistake';

const KICKER: Record<GuideMode, string> = {
  new: 'guide.kickerNew',
  hint: 'guide.kickerHint',
  mistake: 'guide.kickerMistake',
};

/**
 * "Let's work it out together": the method in small steps. Each step asks for one in-between
 * answer; a wrong step shows the right number and asks the learner to type it, so they can't
 * skip through without doing it. `onFinish` gets the learner's first try at the final step.
 */
export function Guide({
  a,
  b,
  mode,
  showBars,
  onFinish,
}: {
  a: number;
  b: number;
  mode: GuideMode;
  showBars: boolean;
  onFinish: (firstFinalTry: number) => void;
}) {
  const guide = useMemo(() => guideFor(a, b), [a, b]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [mustCopy, setMustCopy] = useState(false);
  const [flash, setFlash] = useState(false);
  const firstFinalTry = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const done = idx >= guide.steps.length;
  const step = guide.steps[Math.min(idx, guide.steps.length - 1)];
  const isFinal = idx === guide.steps.length - 1;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [idx, mustCopy, done]);

  const check = useCallback(
    (value: number) => {
      if (isFinal && firstFinalTry.current === null) firstFinalTry.current = value;
      if (value === step.answer) {
        setFlash(true);
        window.setTimeout(() => {
          setFlash(false);
          setInput('');
          setMustCopy(false);
          setIdx((i) => i + 1);
        }, 350);
      } else {
        setInput('');
        setMustCopy(true);
      }
    },
    [isFinal, step.answer],
  );

  const press = useCallback(
    (key: string) => {
      if (done || flash) return;
      if (key === 'back') return setInput((s) => s.slice(0, -1));
      if (key === 'enter') {
        if (input) check(Number(input));
        return;
      }
      const next = (input + key).replace(/^0+(?=\d)/, '').slice(0, 3);
      setInput(next);
      if (next.length >= String(step.answer).length) check(Number(next));
    },
    [check, done, flash, input, step.answer],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') {
        if (done) onFinish(firstFinalTry.current ?? a * b);
        else press('enter');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [a, b, done, onFinish, press]);

  const last = guide.steps[guide.steps.length - 1];

  return (
    <div className="guide">
      <div className="guide-head">
        <p className="kicker">{t(KICKER[mode])}</p>
        <p className="guide-fact num">
          {a} × {b}
          {done ? ` = ${a * b}` : ''}
        </p>
      </div>

      <div className="guide-body" ref={scroller}>
        {done ? (
          // The whole method as a short story.
          <ol className="guide-list">
            {guide.steps.map((s, i) => (
              <li key={i} className="done">
                <span className="muted">{t(`guide.${s.text}`, s.vars)}</span>
                <strong className="num">
                  ✓ {exprText(s.expr)} = {s.answer}
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          // While working, finished steps shrink to their sums so the current step has room.
          idx > 0 && (
            <div className="guide-done-row">
              {guide.steps.slice(0, idx).map((s, i) => (
                <span key={i} className="pill good num">
                  ✓ {exprText(s.expr)} = {s.answer}
                </span>
              ))}
            </div>
          )
        )}

        {!done && (
          <div className="guide-step">
            <p className="guide-text">{t(`guide.${step.text}`, step.vars)}</p>
            {showBars && <BarModel bar={step.bar} />}
            <p className="guide-expr num">
              {exprText(step.expr)} ={' '}
              <span className={`guide-input${flash ? ' good' : ''}`}>{input || (flash ? step.answer : '?')}</span>
            </p>
            {step.note && <p className="guide-note">{t(`guide.${step.note}`, step.vars)}</p>}
            {mustCopy && (
              <p className="guide-note" role="status">
                {t('guide.wrong', { v: step.answer })}
              </p>
            )}
          </div>
        )}

        {done && (
          <div className="guide-step">
            {showBars && <BarModel bar={last.bar} />}
            {last.note && <p className="guide-note">{t(`guide.${last.note}`, last.vars)}</p>}
          </div>
        )}
      </div>

      {done ? (
        <button className="btn btn-primary btn-big" onClick={() => onFinish(firstFinalTry.current ?? a * b)} autoFocus>
          {mode === 'mistake' ? t('common.gotIt') : t('guide.doneButton')}
        </button>
      ) : (
        <NumberPad onPress={press} disabled={flash} canSubmit={input.length > 0} compact />
      )}
    </div>
  );
}
