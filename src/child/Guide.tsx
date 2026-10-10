import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarModel, ExprView, exprText, NoteView, solvedText } from '../components/StrategyView';
import { guideFor, missingGuideFor, type Expr } from '../engine/guide';
import { t } from '../i18n';
import { NumberPad } from './NumberPad';
import { SayAgain, spokenExpr, stopSpeaking, useReadAloud } from './ReadAloud';

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
 *
 * With `missing`, the question is "? × 7 = 56" and the final step fills the gap.
 */
export function Guide({
  a,
  b,
  mode,
  showBars,
  onFinish,
  missing,
  intro = false,
}: {
  a: number;
  b: number;
  mode: GuideMode;
  showBars: boolean;
  onFinish: (firstFinalTry: number) => void;
  missing?: 'a' | 'b';
  /** The very first missing-number question: introduce the idea. */
  intro?: boolean;
}) {
  const guide = useMemo(() => (missing ? missingGuideFor(a, b, missing, intro) : guideFor(a, b)), [a, b, missing, intro]);
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [mustCopy, setMustCopy] = useState(false);
  const [flash, setFlash] = useState(false);
  const firstFinalTry = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const done = idx >= guide.steps.length;
  const step = guide.steps[Math.min(idx, guide.steps.length - 1)];
  const isFinal = idx === guide.steps.length - 1;
  const last = guide.steps[guide.steps.length - 1];
  const target = missing === 'a' ? a : missing === 'b' ? b : a * b;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [idx, mustCopy, done]);

  // Read each step aloud (when read-aloud is on), and the "type this number" note after a slip.
  const { say } = useReadAloud();
  const stepSpeech = done ? '' : `${t(`guide.${step.text}`, step.vars)} ${spokenExpr(step.expr)}`;
  useEffect(() => {
    if (stepSpeech) say(stepSpeech);
  }, [say, stepSpeech]);
  useEffect(() => {
    if (mustCopy) say(t('guide.wrong', { v: step.answer }));
  }, [mustCopy, say, step.answer]);
  useEffect(() => () => stopSpeaking(), []);

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
        if (done) onFinish(firstFinalTry.current ?? target);
        else press('enter');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, onFinish, press, target]);

  const box = <span className={`guide-input${flash ? ' good' : ''}`}>{input || (flash ? step.answer : '?')}</span>;
  // Until it's worked out, a missing-number question shows its gap, never the hidden number.
  // (In the introduction the first step asks for the product, so the puzzle waits until step 2.)
  const heading = missing
    ? done
      ? solvedText(last.expr, last.answer)
      : intro && idx === 0
        ? ''
        : exprText(last.expr)
    : `${a} × ${b}${done ? ` = ${a * b}` : ''}`;

  return (
    <div className="guide">
      <div className="guide-head">
        <p className="kicker">
          {t(missing && mode === 'new' ? 'guide.kickerMissing' : KICKER[mode])}
          {stepSpeech && <SayAgain text={stepSpeech} className="icon-btn icon-btn-sm" />}
        </p>
        <p className="guide-fact num" dir="ltr">
          {heading}
        </p>
      </div>

      <div className="guide-body" ref={scroller}>
        {done ? (
          // The whole method as a short story.
          <ol className="guide-list">
            {guide.steps.map((s, i) => (
              <li key={i} className="done">
                <span className="muted">{t(`guide.${s.text}`, s.vars)}</span>
                <strong className="num" dir="ltr">
                  ✓ {solvedText(s.expr, s.answer)}
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          // While working, finished steps shrink to their sums so the current step has room.
          idx > 0 && (
            <div className="guide-done-row" dir="ltr">
              {guide.steps.slice(0, idx).map((s, i) => (
                <span key={i} className="pill good num">
                  ✓ {solvedText(s.expr, s.answer)}
                </span>
              ))}
            </div>
          )
        )}

        {!done && (
          <div className="guide-step">
            <p className="guide-text">{t(`guide.${step.text}`, step.vars)}</p>
            {showBars && <BarModel bar={step.bar} />}
            <p className="guide-expr num" data-expr={exprText(step.expr)} dir="ltr">
              {step.expr.op === 'gap' ? (
                <GapExpr expr={step.expr} box={box} />
              ) : (
                <>
                  <span key={idx}>
                    <ExprView expr={step.expr} />
                  </span>{' '}
                  = {box}
                </>
              )}
            </p>
            {/* A final-step trick would give the answer away, so it waits until the end. */}
            {step.note && !isFinal && <p className="guide-note">{t(`guide.${step.note}`, step.vars)}</p>}
            {mustCopy && (
              <p className="guide-note" role="status">
                {t('guide.wrong', { v: step.answer })}
              </p>
            )}
          </div>
        )}

        {done && (
          <div className="guide-step">
            {/* A missing-number guide ends with its short, which needs the room. */}
            {showBars && !missing && <BarModel bar={last.bar} />}
            {last.note && <NoteView note={last.note} a={a} b={b} vars={last.vars} missing={missing} />}
          </div>
        )}
      </div>

      {done ? (
        <button className="btn btn-primary btn-big" onClick={() => onFinish(firstFinalTry.current ?? target)} autoFocus>
          {mode === 'mistake' ? t('common.gotIt') : t('guide.doneButton')}
        </button>
      ) : (
        <NumberPad onPress={press} disabled={flash} canSubmit={input.length > 0} compact />
      )}
    </div>
  );
}

/** "? × 7 = 56" with the learner's input in the gap. */
function GapExpr({ expr, box }: { expr: Extract<Expr, { op: 'gap' }>; box: React.ReactNode }) {
  return expr.pos === 'x' ? (
    <>
      {box} × {expr.known} = {expr.p}
    </>
  ) : (
    <>
      {expr.known} × {box} = {expr.p}
    </>
  );
}
